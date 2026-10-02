FROM python:3.11-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl wget build-essential libgomp1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Install Python deps in layers for cache efficiency
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /tmp/requirements.txt

# Jupyter config
RUN jupyter lab --generate-config && \
    echo "c.ServerApp.ip = '0.0.0.0'" >> ~/.jupyter/jupyter_lab_config.py && \
    echo "c.ServerApp.port = 8888" >> ~/.jupyter/jupyter_lab_config.py && \
    echo "c.ServerApp.token = ''" >> ~/.jupyter/jupyter_lab_config.py && \
    echo "c.ServerApp.password = ''" >> ~/.jupyter/jupyter_lab_config.py && \
    echo "c.ServerApp.allow_root = True" >> ~/.jupyter/jupyter_lab_config.py && \
    echo "c.ServerApp.open_browser = False" >> ~/.jupyter/jupyter_lab_config.py

EXPOSE 8888 7860

CMD ["jupyter", "lab", "--ip=0.0.0.0", "--port=8888", "--no-browser", "--allow-root"]
