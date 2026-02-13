#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${GREEN}${BOLD}"
echo "  ███████╗██╗ ██████╗ ██╗███╗   ██╗████████╗"
echo "  ██╔════╝██║██╔════╝ ██║████╗  ██║╚══██╔══╝"
echo "  ███████╗██║██║  ███╗██║██╔██╗ ██║   ██║   "
echo "  ╚════██║██║██║   ██║██║██║╚██╗██║   ██║   "
echo "  ███████║██║╚██████╔╝██║██║ ╚████║   ██║   "
echo "  ╚══════╝╚═╝ ╚═════╝ ╚═╝╚═╝  ╚═══╝   ╚═╝   "
echo -e "  ${CYAN}RADAR v1.0.0${NC}"
echo ""

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo -e "${CYAN}Detected:${NC} ${OS} ${ARCH}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}Error: Docker daemon is not running.${NC}"
    echo "Start Docker Desktop or the Docker service."
    exit 1
fi

echo -e "${GREEN}✓${NC} Docker is running"

# Check docker compose
if docker compose version &> /dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE="docker-compose"
else
    echo -e "${RED}Error: docker compose is not available.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} ${COMPOSE} available"
echo ""

# ─────────────────────────────────────────────
# Linux
# ─────────────────────────────────────────────
if [[ "$OS" == "Linux" ]]; then
    echo -e "${BOLD}Platform: Linux (Native USB)${NC}"
    echo ""

    # Check/apply DVB blacklist
    BLACKLIST_FILE="/etc/modprobe.d/blacklist-dvb.conf"
    if [[ -f "$BLACKLIST_FILE" ]] && grep -q "dvb_usb_rtl28xxu" "$BLACKLIST_FILE" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} DVB drivers already blacklisted"
    else
        echo -e "${YELLOW}⚠${NC} DVB drivers need to be blacklisted for RTL-SDR access."
        echo ""
        echo "  Run these commands (requires sudo):"
        echo ""
        echo -e "  ${CYAN}sudo tee /etc/modprobe.d/blacklist-dvb.conf << 'EOF'"
        echo "  blacklist dvb_usb_rtl28xxu"
        echo "  blacklist rtl2832"
        echo "  blacklist rtl2830"
        echo -e "  EOF${NC}"
        echo -e "  ${CYAN}sudo modprobe -r dvb_usb_rtl28xxu 2>/dev/null${NC}"
        echo ""
        read -p "Apply blacklist now? (y/N) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo tee "$BLACKLIST_FILE" > /dev/null << 'BLEOF'
blacklist dvb_usb_rtl28xxu
blacklist rtl2832
blacklist rtl2830
BLEOF
            sudo modprobe -r dvb_usb_rtl28xxu 2>/dev/null || true
            echo -e "${GREEN}✓${NC} DVB drivers blacklisted"
        else
            echo -e "${YELLOW}Skipped.${NC} You may need to blacklist manually."
        fi
    fi

    # Check if RTL-SDR is plugged in
    if lsusb 2>/dev/null | grep -qi "RTL2838\|RTL2832\|0bda:2838\|0bda:2832"; then
        echo -e "${GREEN}✓${NC} RTL-SDR dongle detected"
    else
        echo -e "${YELLOW}⚠${NC} No RTL-SDR dongle detected. Plug it in or use fake_mode."
    fi

    echo ""
    echo -e "${BOLD}Starting SIGINT RADAR...${NC}"
    echo ""
    $COMPOSE up --build

# ─────────────────────────────────────────────
# macOS
# ─────────────────────────────────────────────
elif [[ "$OS" == "Darwin" ]]; then
    echo -e "${BOLD}Platform: macOS (Docker + rtl_tcp)${NC}"
    echo ""
    echo -e "${YELLOW}Note:${NC} macOS cannot pass USB devices to Docker."
    echo "  We use rtl_tcp to bridge the SDR over the network."
    echo ""

    # Check for librtlsdr / rtl_tcp
    if command -v rtl_tcp &> /dev/null; then
        echo -e "${GREEN}✓${NC} rtl_tcp found: $(which rtl_tcp)"
    else
        echo -e "${RED}✗${NC} rtl_tcp not found."
        echo ""
        echo "  Install with Homebrew:"
        echo -e "  ${CYAN}brew install librtlsdr${NC}"
        echo ""
        read -p "Install now? (y/N) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            brew install librtlsdr
            echo -e "${GREEN}✓${NC} librtlsdr installed"
        else
            echo -e "${YELLOW}Skipped.${NC} Install manually before using with a real SDR."
        fi
    fi

    # Check if rtl_tcp is running
    if pgrep -x rtl_tcp > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} rtl_tcp is running"
    else
        echo -e "${YELLOW}⚠${NC} rtl_tcp is NOT running."
        echo ""
        echo "  Start it in a separate terminal:"
        echo -e "  ${CYAN}rtl_tcp -a 0.0.0.0 -p 1234${NC}"
        echo ""
        echo "  Or continue without it (fake_mode will be used if no SDR)."
        echo ""
    fi

    # Ensure config.yaml has rtl_tcp source
    CONFIG_FILE="config.yaml"
    if [[ -f "$CONFIG_FILE" ]]; then
        if grep -q "source: rtl_tcp" "$CONFIG_FILE" 2>/dev/null; then
            echo -e "${GREEN}✓${NC} config.yaml already set to rtl_tcp"
        else
            echo -e "${YELLOW}⚠${NC} config.yaml is not set to rtl_tcp mode."
            read -p "Switch to rtl_tcp mode? (Y/n) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Nn]$ ]]; then
                # Use sed to update source field
                if grep -q "source:" "$CONFIG_FILE"; then
                    sed -i '' 's/source: usb/source: rtl_tcp/' "$CONFIG_FILE"
                else
                    # Append rtl_tcp config
                    cat >> "$CONFIG_FILE" << 'RTLEOF'

rtlsdr:
  source: rtl_tcp
  rtl_tcp_host: host.docker.internal
  rtl_tcp_port: 1234
RTLEOF
                fi
                echo -e "${GREEN}✓${NC} config.yaml updated to rtl_tcp mode"
            fi
        fi
    else
        echo -e "${YELLOW}⚠${NC} No config.yaml found. Creating with rtl_tcp defaults..."
        cat > "$CONFIG_FILE" << 'CFGEOF'
rtlsdr:
  source: rtl_tcp
  rtl_tcp_host: host.docker.internal
  rtl_tcp_port: 1234
  gain: 40
  ppm_correction: 0
  bias_tee: false

scanner:
  fake_mode: false
CFGEOF
        echo -e "${GREEN}✓${NC} config.yaml created"
    fi

    echo ""
    echo -e "${BOLD}Starting SIGINT RADAR...${NC}"
    echo ""
    $COMPOSE up --build

# ─────────────────────────────────────────────
# Unknown OS
# ─────────────────────────────────────────────
else
    echo -e "${YELLOW}Unknown OS: ${OS}${NC}"
    echo "Attempting to start with Docker Compose..."
    echo ""
    $COMPOSE up --build
fi
