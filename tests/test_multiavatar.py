"""Run: .venv/bin/python tests/test_multiavatar.py   (no model, no pytest needed)"""
import asyncio, json, os, socket, sys, tempfile, threading, time
from pathlib import Path

RUNS = tempfile.mkdtemp()
os.environ["CRANE_RUNS_DIR"] = RUNS
os.environ["CRANE_OPENCODE_CFG"] = "/nonexistent.jsonc"
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "server"))
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

import multiavatar

def make_fake(tag: str, log: list):
    app = FastAPI()
    @app.post("/v1/chat/completions")
    async def completions(body: dict):
        log.append(body)
        n, model = len(log), body["model"]
        words = ["same", " words", " again", " and", " again", " friend"] if model == "loop" else [f"{tag}-reply{n}", " from", f" {model}"]
        async def gen():
            for w in words:
                if model == "slow": await asyncio.sleep(0.25)
                yield "data: " + json.dumps({"choices": [{"delta": {"content": w}}]}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(gen(), media_type="text/event-stream")
    @app.get("/v1/models")
    async def models(): return {"data": [{"id": "m1"}]}
    return app

def serve(app):
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    threading.Thread(target=srv.run, daemon=True).start()
    while not srv.started: time.sleep(0.05)
    return port

logA, logB = [], []
pa, pb = serve(make_fake("A", logA)), serve(make_fake("B", logB))
os.environ["CRANE_PIPELINES"] = json.dumps({
    "local":  {"url": f"http://127.0.0.1:{pa}/v1", "model": "m1", "concurrency": 1},
    "gpu":    {"url": f"http://127.0.0.1:{pb}/v1", "model": "m2", "concurrency": 2}})

app = FastAPI()
@app.websocket("/ws/multi-avatar")
async def ws(w: WebSocket):
    await w.accept(); await multiavatar.run_session(w)
client = TestClient(app)

def collect(c, until):
    out = []
    while True:
        m = c.receive_json(); out.append(m)
        if m["type"] in until: return out

seats4 = [{"id": f"s{i}", "name": n, "persona": f"persona {n}"} for i, n in enumerate(["Ada", "Bo", "Cy", "Di"], 1)]

# 1) shared cluster: 4 seats, round-robin, all on pipeline 'local'
with client.websocket_connect("/ws/multi-avatar") as c:
    c.send_json({"type": "start", "seats": seats4, "topic": "robots", "max_turns": 8, "wait_for_speech": False})
    evs = collect(c, {"finished", "error"})
assert evs[-1]["type"] == "finished", evs[-1]
done = [e for e in evs if e["type"] == "turn_done"]
assert [e["seat"] for e in done] == ["s1", "s2", "s3", "s4"] * 2
assert not logB and len(logA) == 8, "shared cluster must serve every seat"
print("ok: shared cluster, 4 seats round-robin")

# 2) isolated pipelines: each seat hits its own backend + model
logA.clear(); logB.clear()
iso = [{"id": "a", "name": "Ada", "pipeline": "local"}, {"id": "b", "name": "Bo", "pipeline": "gpu", "model": "special"}]
with client.websocket_connect("/ws/multi-avatar") as c:
    c.send_json({"type": "start", "seats": iso, "topic": "t", "max_turns": 4, "wait_for_speech": False})
    evs = collect(c, {"finished", "error"})
done = [e for e in evs if e["type"] == "turn_done"]
assert len(logA) == 2 and len(logB) == 2, (len(logA), len(logB))
assert all(r["model"] == "m1" for r in logA) and all(r["model"] == "special" for r in logB)
assert done[1]["pipeline"] == "gpu" and done[0]["pipeline"] == "local"
print("ok: isolated per-seat pipelines + model override")

# 3) metrics, quality, summary, saved run
m = done[0]["metrics"]
assert {"queue_ms", "ttft_ms", "total_ms", "chunks", "tps"} <= set(m) and m["chunks"] == 3
assert {"words", "repetition", "diversity"} <= set(done[0]["quality"])
fin = evs[-1]
assert set(fin["summary"]) == {"a", "b"} and fin["summary"]["a"]["turns"] == 2
saved = json.loads((Path(RUNS) / f"{fin['run_id']}.json").read_text())
assert saved["mode"] == "converse" and len(saved["turns"]) == 4
print("ok: metrics, quality scores, summary, run recorded")

# 4) arena: same prompt to all seats in parallel, one answer each + leaderboard
logA.clear(); logB.clear()
with client.websocket_connect("/ws/multi-avatar") as c:
    c.send_json({"type": "start", "mode": "arena", "topic": "say hi", "seats": iso})
    evs = collect(c, {"finished", "error"})
assert evs[-1]["type"] == "finished" and {e["seat"] for e in evs if e["type"] == "turn_done"} == {"a", "b"}
assert logA[0]["messages"][-1]["content"] == "say hi" and logB[0]["messages"][-1]["content"] == "say hi"
print("ok: arena mode (parallel, identical prompt)")

# 5) mention policy: Ada naming Cy hands the floor to Cy (not Bo)
logA.clear()
orig = multiavatar.Session._next
mention_seats = [{"id": "s1", "name": "Ada"}, {"id": "s2", "name": "Bo"}, {"id": "s3", "name": "Cy"}]
s = multiavatar.Session(lambda m: asyncio.sleep(0)); s.seats = mention_seats
assert s._next("mention", 0, "I think Cy should answer that") == 2
assert s._next("mention", 0, "nobody named here") == 1
assert s._next("round_robin", 2, "") == 0 and s._next("random", 1, "") in (0, 2)
print("ok: turn policies")

# 6) barge-in: host interrupts a slow speaker mid-sentence; engine moves on
logA.clear()
slow = [{"id": "x", "name": "Slowpoke", "model": "slow"}, {"id": "y", "name": "Quick"}]
with client.websocket_connect("/ws/multi-avatar") as c:
    c.send_json({"type": "start", "seats": slow, "topic": "t", "max_turns": 2, "wait_for_speech": False})
    first = collect(c, {"token"})
    c.send_json({"type": "say", "text": "Stop right there", "as": "Host", "interrupt": True})
    evs = first + collect(c, {"finished", "error"})
kinds = [e["type"] for e in evs]
assert "interrupted" in kinds, kinds
assert any("Host: Stop right there" in m["content"] for r in logA[1:] for m in r["messages"]), "host line must reach the next speaker"
print("ok: barge-in interrupts speaker, host line reaches next turn")

# 7) loop guard stops a degenerate conversation
with client.websocket_connect("/ws/multi-avatar") as c:
    c.send_json({"type": "start", "seats": [{"id": "p", "name": "P", "model": "loop"}, {"id": "q", "name": "Q", "model": "loop"}],
                 "topic": "t", "max_turns": 30, "wait_for_speech": False, "guard": True})
    evs = collect(c, {"finished", "error", "warning"})
assert evs[-1]["type"] == "warning" and len([e for e in evs if e["type"] == "turn_done"]) < 10, evs[-1]
print("ok: loop guard trips on repetition")

# 8) input hardening + unknown pipeline rejected
pls = multiavatar.load_pipelines()
assert len(multiavatar.normalize_seats([{"name": "x"}] * 9, pls)) == 4
assert multiavatar.normalize_seats(["junk", 5, None], pls) == []
assert len(multiavatar.normalize_seats([{"persona": "p" * 5000}], pls)[0]["persona"]) == 600
try: multiavatar.normalize_seats([{"pipeline": "http://evil"}], pls); raise SystemExit("should reject")
except ValueError: pass
print("ok: sanitising, client cannot supply URLs")

# 9) headless scenario run (no websocket)
rec = asyncio.run(multiavatar.run_headless({"seats": iso, "topic": "t", "max_turns": 2}))
assert len(rec["turns"]) == 2 and rec["summary"]
print("ok: headless runner")

# 10) pipelines + runs REST
rc = TestClient(FastAPI()); rapp = FastAPI(); rapp.include_router(multiavatar.router); rc = TestClient(rapp)
p = rc.get("/api/multiavatar/pipelines").json()
assert {x["name"] for x in p["pipelines"]} == {"local", "gpu"} and all(x["online"] for x in p["pipelines"])
assert rc.get("/api/multiavatar/runs").json()["runs"]
assert rc.get("/api/multiavatar/runs/..%2Fetc").status_code in (400, 404)
print("ok: REST pipelines health + runs")
print("ALL PASS")
