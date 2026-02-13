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

# Build SatDump from source (headless CLI only)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4-openssl-dev \
    libjpeg-dev \
    libpng-dev \
    libtiff-dev \
    libnng-dev \
    libjemalloc-dev \
    libvolk2-dev \
    && rm -rf /var/lib/apt/lists/* && \
    git clone --depth 1 https://github.com/SatDump/SatDump.git /tmp/satdump && \
    cd /tmp/satdump && \
    mkdir build && cd build && \
    cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_GUI=OFF \
        -DBUILD_OPENCL=OFF \
        -DBUILD_OPENMP=ON \
        && \
    make -j$(nproc) && \
    make install && \
    ldconfig && \
    rm -rf /tmp/satdump

WORKDIR /app

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data/captures

EXPOSE 8765 8080

CMD ["python", "main.py"]
