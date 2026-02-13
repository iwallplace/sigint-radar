FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    libusb-1.0-0-dev \
    librtlsdr-dev \
    rtl-sdr \
    rtl-433 \
    multimon-ng \
    gnuradio \
    libsoapysdr-dev \
    soapysdr-module-rtlsdr \
    libfftw3-dev \
    default-jre-headless \
    wget \
    curl \
    sox \
    pkg-config \
    libncurses-dev \
    zlib1g-dev \
    libzstd-dev \
    libasound2-dev \
    && rm -rf /var/lib/apt/lists/*

# Blacklist DVB-T kernel modules so RTL-SDR can use the dongle
RUN echo "blacklist dvb_usb_rtl28xxu" > /etc/modprobe.d/blacklist-dvb.conf && \
    echo "blacklist rtl2832" >> /etc/modprobe.d/blacklist-dvb.conf && \
    echo "blacklist rtl2830" >> /etc/modprobe.d/blacklist-dvb.conf

# Build readsb from source
RUN git clone --depth 1 https://github.com/wiedehopf/readsb.git /tmp/readsb && \
    cd /tmp/readsb && \
    make -j$(nproc) RTLSDR=yes && \
    cp readsb /usr/local/bin/ && \
    rm -rf /tmp/readsb

# Build libacars (required by dumpvdl2)
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-dev libjansson-dev && \
    rm -rf /var/lib/apt/lists/* && \
    git clone --depth 1 https://github.com/szpajder/libacars.git /tmp/libacars && \
    cd /tmp/libacars && \
    mkdir build && cd build && \
    cmake .. && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    rm -rf /tmp/libacars

# Build dumpvdl2 from source
RUN git clone --depth 1 https://github.com/szpajder/dumpvdl2.git /tmp/dumpvdl2 && \
    cd /tmp/dumpvdl2 && \
    mkdir build && cd build && \
    cmake .. && \
    make -j$(nproc) && \
    make install && \
    rm -rf /tmp/dumpvdl2

# Build direwolf from source
RUN git clone --depth 1 https://github.com/wb2osz/direwolf.git /tmp/direwolf && \
    cd /tmp/direwolf && \
    mkdir build && cd build && \
    cmake .. && \
    make -j$(nproc) && \
    make install && \
    rm -rf /tmp/direwolf

# Install SatDump latest release .deb
RUN ARCH=$(dpkg --print-architecture) && \
    SATDUMP_URL=$(curl -s https://api.github.com/repos/SatDump/SatDump/releases/latest | \
    grep "browser_download_url.*${ARCH}.*\.deb" | head -1 | cut -d '"' -f 4) && \
    if [ -n "$SATDUMP_URL" ]; then \
        wget -q -O /tmp/satdump.deb "$SATDUMP_URL" && \
        dpkg -i /tmp/satdump.deb || apt-get install -f -y && \
        rm -f /tmp/satdump.deb; \
    else \
        echo "SatDump .deb not found for $ARCH, skipping"; \
    fi

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data/captures

EXPOSE 8765 8080

CMD ["python", "main.py"]
