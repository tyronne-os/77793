#!/usr/bin/env bash
# setup_usbpool.sh — combine USB drives into one logical volume via LVM linear
# Fills drives sequentially: storage1 → storage2 → storage3 → storage4
# Result: single /mnt/usbpool mount point (~86 GB)
set -euo pipefail

MOUNT_POINT="/mnt/usbpool"
VG_NAME="usbvg"
LV_NAME="usbpool"
LV_PATH="/dev/${VG_NAME}/${LV_NAME}"

# ── 1. Install lvm2 if missing ─────────────────────────────────────────────
if ! command -v pvcreate &>/dev/null; then
    echo "Installing lvm2..."
    apt-get install -y lvm2
fi

# ── 2. Detect USB drives by label ─────────────────────────────────────────
# Find drives with our storage labels (sda–sdd, no partitions)
DRIVES=()
for label in storage1 storage2 storage3 storage4; do
    dev=$(blkid -L "$label" 2>/dev/null || true)
    if [[ -n "$dev" ]]; then
        DRIVES+=("$dev")
        echo "Found $label → $dev"
    else
        echo "WARNING: $label not found — skipping"
    fi
done

if [[ ${#DRIVES[@]} -eq 0 ]]; then
    echo "ERROR: No labeled storage drives found. Run setup and label drives first."
    exit 1
fi

echo ""
echo "Drives to pool: ${DRIVES[*]}"
echo ""

# ── 3. Unmount any auto-mounted drives ────────────────────────────────────
for dev in "${DRIVES[@]}"; do
    if mountpoint -q "$(lsblk -no MOUNTPOINT "$dev" 2>/dev/null)" 2>/dev/null; then
        echo "Unmounting $dev..."
        umount "$dev" || true
    fi
done
# Also unmount any /media/calstate/storage* entries
for label in storage1 storage2 storage3 storage4; do
    mp="/media/calstate/${label}"
    if mountpoint -q "$mp" 2>/dev/null; then
        umount "$mp" || true
    fi
done

# ── 4. Wipe existing LVM signatures & create physical volumes ─────────────
for dev in "${DRIVES[@]}"; do
    echo "Preparing $dev as LVM PV..."
    wipefs -a "$dev"
    pvcreate -ff -y "$dev"
done

# ── 5. Create volume group ─────────────────────────────────────────────────
echo "Creating volume group ${VG_NAME}..."
vgcreate "$VG_NAME" "${DRIVES[@]}"

# ── 6. Create linear logical volume spanning all drives ───────────────────
echo "Creating logical volume ${LV_NAME} (linear, full size)..."
lvcreate -l 100%VG --type linear -n "$LV_NAME" "$VG_NAME"

# ── 7. Format and mount ────────────────────────────────────────────────────
echo "Formatting ${LV_PATH} as ext4..."
mkfs.ext4 -L usbpool "$LV_PATH"

mkdir -p "$MOUNT_POINT"
mount "$LV_PATH" "$MOUNT_POINT"
chown "$SUDO_USER":"$SUDO_USER" "$MOUNT_POINT"

# ── 8. Persist in /etc/fstab ──────────────────────────────────────────────
UUID=$(blkid -s UUID -o value "$LV_PATH")
FSTAB_LINE="UUID=${UUID}  ${MOUNT_POINT}  ext4  defaults,nofail  0  2"

if grep -q "$UUID" /etc/fstab 2>/dev/null; then
    echo "fstab entry already exists — skipping"
else
    echo "$FSTAB_LINE" >> /etc/fstab
    echo "Added to /etc/fstab for auto-mount on boot"
fi

# ── 9. Summary ────────────────────────────────────────────────────────────
echo ""
echo "=== USB POOL READY ==="
df -h "$MOUNT_POINT"
echo ""
echo "Mount point : $MOUNT_POINT"
echo "Volume group: $VG_NAME"
echo "Logical vol : $LV_PATH"
echo ""
echo "To use for Ollama models:"
echo "  export OLLAMA_MODELS=${MOUNT_POINT}/ollama"
echo "  mkdir -p ${MOUNT_POINT}/ollama"
echo ""
echo "To add more drives later:"
echo "  sudo pvcreate /dev/sdX"
echo "  sudo vgextend ${VG_NAME} /dev/sdX"
echo "  sudo lvextend -l +100%FREE ${LV_PATH}"
echo "  sudo resize2fs ${LV_PATH}"
