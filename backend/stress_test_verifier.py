import cv2
import numpy as np
import time
import json
import base64
import os

# Mock the liveness function for testing thresholds
def test_liveness(img_gray):
    dft = np.fft.fft2(img_gray)
    dft_shift = np.fft.fftshift(dft)
    magnitude_spectrum = 20 * np.log(np.abs(dft_shift) + 1)
    h, w = img_gray.shape
    cy, cx = h // 2, w // 2
    magnitude_spectrum[cy-10:cy+10, cx-10:cx+10] = 0
    max_freq = np.max(magnitude_spectrum)
    avg_freq = np.mean(magnitude_spectrum)
    freq_ratio = max_freq / avg_freq if avg_freq > 0 else 0
    laplacian_var = cv2.Laplacian(img_gray, cv2.CV_64F).var()
    is_screen = freq_ratio > 3.5 or laplacian_var < 50.0
    return {"is_liveness_passing": not is_screen, "freq_ratio": freq_ratio, "laplacian_var": laplacian_var}

def run_stress_test():
    print("--- SignVerify Production Stress Test ---")
    
    # 1. Test "Clean Paper" (Simulated)
    paper = np.random.randint(200, 255, (1024, 1024), dtype=np.uint8)
    cv2.putText(paper, "SIG-ABCD-1234", (100, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (0,), 2)
    res_paper = test_liveness(paper)
    print(f"[TEST] Clean Paper: Liveness={res_paper['is_liveness_passing']}, FreqRatio={res_paper['freq_ratio']:.2f}, Var={res_paper['laplacian_var']:.2f}")

    # 2. Test "Digital Screen" (Simulated via Periodic Noise)
    screen = paper.copy()
    # Add Moiré-like grid noise
    for i in range(0, 1024, 4):
        screen[i, :] = screen[i, :] * 0.8
    res_screen = test_liveness(screen)
    print(f"[TEST] Digital Screen (Moiré): Liveness={res_screen['is_liveness_passing']}, FreqRatio={res_screen['freq_ratio']:.2f}, Var={res_screen['laplacian_var']:.2f}")

    # 3. Test "Blurry Document"
    blurry = cv2.GaussianBlur(paper, (21, 21), 0)
    res_blur = test_liveness(blurry)
    print(f"[TEST] Blurry Doc: Liveness={res_blur['is_liveness_passing']}, FreqRatio={res_blur['freq_ratio']:.2f}, Var={res_blur['laplacian_var']:.2f}")

    # Performance Benchmarking
    start = time.time()
    for _ in range(50):
        test_liveness(paper)
    end = time.time()
    print(f"\n[PERF] Liveness Benchmark: {(end-start)/50*1000:.2f}ms per frame")

    # Conclusion
    success = res_paper['is_liveness_passing'] and not res_screen['is_liveness_passing']
    if success:
        print("\n✅ THRESHOLDS VALIDATED: System correctly distinguishes paper from screens.")
    else:
        print("\n❌ THRESHOLD FAILURE: Tuning required.")

if __name__ == "__main__":
    run_stress_test()
