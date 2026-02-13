import logging

import numpy as np
from scipy import signal as scipy_signal

logger = logging.getLogger("sigint-radar")


class SignalDetector:
    def __init__(self, fft_size=2048, fft_averages=16, threshold_db=10):
        self.fft_size = fft_size
        self.fft_averages = fft_averages
        self.threshold_db = threshold_db

    def detect_signals(self, iq_samples, center_freq, sample_rate):
        """Detect signals in IQ samples using Welch PSD.

        Returns list of (freq_hz, power_db, bandwidth_hz, snr_db).
        """
        try:
            freqs, psd = scipy_signal.welch(
                iq_samples,
                fs=sample_rate,
                nperseg=min(self.fft_size, len(iq_samples)),
                noverlap=self.fft_size // 2,
                return_onesided=False,
                detrend=False,
            )

            psd_db = 10 * np.log10(np.maximum(psd, 1e-20))
            freqs_hz = np.fft.fftshift(freqs) + center_freq
            psd_db = np.fft.fftshift(psd_db)

            noise_floor = np.median(psd_db)
            threshold = noise_floor + self.threshold_db

            above = psd_db > threshold
            if not np.any(above):
                return []

            # Connected components for signal grouping
            diff = np.diff(above.astype(int))
            starts = np.where(diff == 1)[0] + 1
            ends = np.where(diff == -1)[0] + 1

            if above[0]:
                starts = np.insert(starts, 0, 0)
            if above[-1]:
                ends = np.append(ends, len(above))

            detected = []
            for start, end in zip(starts, ends):
                segment_psd = psd_db[start:end]
                segment_freqs = freqs_hz[start:end]

                peak_idx = np.argmax(segment_psd)
                peak_freq = float(segment_freqs[peak_idx])
                peak_power = float(segment_psd[peak_idx])
                bandwidth = float(segment_freqs[-1] - segment_freqs[0])
                snr = float(peak_power - noise_floor)

                detected.append((peak_freq, peak_power, bandwidth, snr))

            return detected

        except Exception as e:
            logger.error("Signal detection error: %s", e)
            return []

    def get_spectrum(self, iq_samples, center_freq, sample_rate):
        """Compute spectrum for waterfall display.

        Returns (freqs_hz[], psd_db[]).
        """
        try:
            freqs, psd = scipy_signal.welch(
                iq_samples,
                fs=sample_rate,
                nperseg=min(self.fft_size, len(iq_samples)),
                noverlap=self.fft_size // 2,
                return_onesided=False,
                detrend=False,
            )

            psd_db = 10 * np.log10(np.maximum(psd, 1e-20))
            freqs_hz = np.fft.fftshift(freqs) + center_freq
            psd_db = np.fft.fftshift(psd_db)

            return freqs_hz.tolist(), psd_db.tolist()

        except Exception as e:
            logger.error("Spectrum computation error: %s", e)
            return [], []
