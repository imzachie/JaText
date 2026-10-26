import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { type BubbleStyleId, getBubbleStyleMeta } from "../lib/chatCustomization";

interface BubbleVisualSpec {
  bg: string;
  border: string;
  textColor: string;
  radius?: string;
  shadow?: string;
  padExtra?: { top?: number; right?: number; bottom?: number; left?: number };
  renderDecorations: () => ReactNode;
}

const BUBBLE_SPECS: Record<Exclude<BubbleStyleId, "default">, BubbleVisualSpec> = {
  "whee-sketch": {
    bg: "linear-gradient(135deg, #d7fcd4 0%, #bef5b9 100%)",
    border: "2px solid #1f2922",
    textColor: "#141c16",
    radius: "18px 20px 16px 21px",
    shadow: "2px 3px 0 rgba(25, 38, 28, 0.32)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="24" height="18" viewBox="0 0 24 18" aria-hidden="true">
          <path d="M3 14 C5 6, 12 3, 21 4" fill="none" stroke="#1f2922" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 16 L9 12" stroke="#5ec96f" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
          <path d="M16 3 C18 9, 15 14, 20 16 L11 14" fill="#bef5b9" stroke="#1f2922" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </>
    ),
  },

  "ghost-limited": {
    bg: "#ffffff",
    border: "1.8px solid #d9dce8",
    textColor: "#171821",
    radius: "20px",
    padExtra: { right: 16 },
    shadow: "0 4px 14px rgba(15, 18, 34, 0.16)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="22" height="20" viewBox="0 0 22 20" aria-hidden="true">
          <path d="M9 2 L10.5 6.5 L15 8 L10.5 9.5 L9 14 L7.5 9.5 L3 8 L7.5 6.5 Z" fill="#ffd452" />
        </svg>
        <svg className="bs-deco bs-right-center" width="36" height="40" viewBox="0 0 36 40" aria-hidden="true">
          <path
            d="M7 20 C7 9, 27 9, 27 20 L29 33 C26 31, 24 35, 21 33 C18 31, 16 35, 13 33 C10 31, 8 34, 6 32 Z"
            fill="#ffffff"
            stroke="#232533"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <ellipse cx="14" cy="19" rx="2" ry="2.8" fill="#1b1c26" />
          <ellipse cx="21" cy="19" rx="2" ry="2.8" fill="#1b1c26" />
          <ellipse cx="17.5" cy="24" rx="2.1" ry="2.8" fill="#2b2030" />
          <circle cx="10.8" cy="22" r="2.2" fill="#ff9eb5" opacity="0.8" />
          <circle cx="24.2" cy="22" r="2.2" fill="#ff9eb5" opacity="0.8" />
        </svg>
      </>
    ),
  },

  "pumpkin-limited": {
    bg: "linear-gradient(180deg, #ff9638 0%, #f56d16 100%)",
    border: "2px solid #9c3400",
    textColor: "#140800",
    radius: "21px",
    padExtra: { top: 4 },
    shadow: "0 4px 12px rgba(235, 92, 12, 0.32)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-center" width="38" height="20" viewBox="0 0 38 20" aria-hidden="true">
          <path d="M17 16 C16 9, 20 3, 25 3 C26 6, 22 10, 22 16 Z" fill="#2f8f38" stroke="#184d1d" strokeWidth="1.6" />
          <path d="M17 14 C11 10, 7 12, 9 16 C12 18, 15 17, 17 15 Z" fill="#46b84f" stroke="#184d1d" strokeWidth="1.4" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">
          <circle cx="15" cy="13" r="9.5" fill="#ff7a1a" stroke="#7c2800" strokeWidth="1.7" />
          <polygon points="11,11 13.5,8 14.5,11.5" fill="#3a1200" />
          <polygon points="16.5,11.5 18,8 20,11" fill="#3a1200" />
          <path d="M10.5 14.5 Q15 18.5 19.5 14.5" fill="none" stroke="#3a1200" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </>
    ),
  },

  "spider-limited": {
    bg: "linear-gradient(135deg, #272238 0%, #171422 100%)",
    border: "1.8px solid #594f7a",
    textColor: "#ffffff",
    radius: "20px",
    padExtra: { right: 10 },
    shadow: "0 4px 14px rgba(0, 0, 0, 0.4)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
          <path d="M2 2 L28 6 M2 2 L22 18 M2 2 L8 26" stroke="#a69ec4" strokeWidth="1.2" opacity="0.75" />
          <path d="M12 4 Q11 10 5 12 M20 5 Q18 14 7 19" fill="none" stroke="#a69ec4" strokeWidth="1.1" opacity="0.75" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
          <line x1="18" y1="0" x2="18" y2="15" stroke="#cfc8e8" strokeWidth="1.2" />
          <path d="M9 17 Q5 14 3 17 M9 20 Q4 20 2 23 M27 17 Q31 14 33 17 M27 20 Q32 20 34 23" fill="none" stroke="#111019" strokeWidth="2" strokeLinecap="round" />
          <circle cx="18" cy="19" r="7.5" fill="#14121d" stroke="#7d72a6" strokeWidth="1.3" />
          <circle cx="15.5" cy="18.5" r="2.1" fill="#ffffff" />
          <circle cx="20.5" cy="18.5" r="2.1" fill="#ffffff" />
          <circle cx="15.8" cy="18.7" r="1" fill="#111" />
          <circle cx="20.2" cy="18.7" r="1" fill="#111" />
        </svg>
      </>
    ),
  },

  "bubbly-otter": {
    bg: "linear-gradient(135deg, #e3f6ff 0%, #c8ecff 100%)",
    border: "2px solid #7bc9f5",
    textColor: "#142636",
    radius: "22px",
    padExtra: { left: 18 },
    shadow: "0 4px 12px rgba(74, 171, 228, 0.22)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-left-center" width="38" height="42" viewBox="0 0 38 42" aria-hidden="true">
          <circle cx="10" cy="11" r="4" fill="#9c6b43" stroke="#4d311b" strokeWidth="1.5" />
          <circle cx="26" cy="11" r="4" fill="#9c6b43" stroke="#4d311b" strokeWidth="1.5" />
          <ellipse cx="18" cy="21" rx="12" ry="13" fill="#b57f52" stroke="#4d311b" strokeWidth="1.6" />
          <ellipse cx="18" cy="20" rx="8.5" ry="7" fill="#f5dfc6" />
          <circle cx="14.2" cy="17.5" r="1.6" fill="#24160c" />
          <circle cx="21.8" cy="17.5" r="1.6" fill="#24160c" />
          <ellipse cx="18" cy="20" rx="2.3" ry="1.6" fill="#3b2313" />
          <path d="M15.5 22.2 Q18 24 20.5 22.2" fill="none" stroke="#3b2313" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="11.8" cy="20.5" r="1.8" fill="#ff9db0" opacity="0.8" />
          <circle cx="24.2" cy="20.5" r="1.8" fill="#ff9db0" opacity="0.8" />
        </svg>
        <svg className="bs-deco bs-top-right" width="30" height="28" viewBox="0 0 30 28" aria-hidden="true">
          <circle cx="20" cy="10" r="6.5" fill="rgba(255,255,255,0.75)" stroke="#7cc7f7" strokeWidth="1.4" />
          <circle cx="18" cy="8" r="1.8" fill="#ffffff" />
          <circle cx="9" cy="17" r="4" fill="rgba(255,215,245,0.75)" stroke="#8ad0fa" strokeWidth="1.2" />
        </svg>
      </>
    ),
  },

  "glam-diva": {
    bg: "#ffffff",
    border: "1.8px solid #f2cad8",
    textColor: "#1b1420",
    radius: "22px",
    padExtra: { top: 10, left: 8, right: 8 },
    shadow: "0 4px 14px rgba(225, 75, 130, 0.18)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-center" width="68" height="28" viewBox="0 0 68 28" aria-hidden="true">
          {/* Left glam eye */}
          <path d="M9 13 Q17 6 25 13" fill="#c084fc" stroke="#1f1424" strokeWidth="1.6" />
          <ellipse cx="17" cy="14" rx="7" ry="4" fill="#ffffff" stroke="#1f1424" strokeWidth="1.5" />
          <circle cx="18" cy="14" r="2.6" fill="#231829" />
          <circle cx="19" cy="13" r="0.9" fill="#fff" />
          <path d="M9 11 L6 8 M13 8.5 L11 5 M17 8 L17 4.5" stroke="#1f1424" strokeWidth="1.4" strokeLinecap="round" />
          {/* Right glam eye */}
          <path d="M43 13 Q51 6 59 13" fill="#c084fc" stroke="#1f1424" strokeWidth="1.6" />
          <ellipse cx="51" cy="14" rx="7" ry="4" fill="#ffffff" stroke="#1f1424" strokeWidth="1.5" />
          <circle cx="52" cy="14" r="2.6" fill="#231829" />
          <circle cx="53" cy="13" r="0.9" fill="#fff" />
          <path d="M59 11 L62 8 M55 8.5 L57 5 M51 8 L51 4.5" stroke="#1f1424" strokeWidth="1.4" strokeLinecap="round" />
          {/* Plump glossy red lips */}
          <path d="M26 22 Q30 18 34 20.5 Q38 18 42 22 Q34 27.5 26 22 Z" fill="#e11d48" stroke="#7f1029" strokeWidth="1.2" />
          <path d="M28 22 Q34 23.2 40 22" stroke="#7f1029" strokeWidth="1" fill="none" />
        </svg>
        <svg className="bs-deco bs-bottom-left" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19 L9 9 M9 20 L13 10 M13 21 L17 12" stroke="#f3c6a8" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="9.5" cy="7.8" r="1.8" fill="#e11d48" />
          <circle cx="13.5" cy="8.8" r="1.8" fill="#e11d48" />
          <circle cx="17.5" cy="10.8" r="1.8" fill="#e11d48" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 19 L15 9 M15 20 L11 10 M11 21 L7 12" stroke="#f3c6a8" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="14.5" cy="7.8" r="1.8" fill="#e11d48" />
          <circle cx="10.5" cy="8.8" r="1.8" fill="#e11d48" />
          <circle cx="6.5" cy="10.8" r="1.8" fill="#e11d48" />
        </svg>
      </>
    ),
  },

  "chill-croc": {
    bg: "linear-gradient(180deg, #7be068 0%, #55c447 100%)",
    border: "2px solid #1f6319",
    textColor: "#0e1f0b",
    radius: "20px",
    padExtra: { top: 8 },
    shadow: "0 4px 12px rgba(48, 148, 39, 0.3)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="48" height="26" viewBox="0 0 48 26" aria-hidden="true">
          {/* Backwards orange cap + croc eyes */}
          <path d="M12 14 C12 6, 30 6, 30 14 Z" fill="#ff7b1c" stroke="#6e2c00" strokeWidth="1.5" />
          <path d="M4 14 L15 14" stroke="#ff7b1c" strokeWidth="4" strokeLinecap="round" />
          <circle cx="24" cy="17" r="4.8" fill="#ffffff" stroke="#1f6319" strokeWidth="1.5" />
          <circle cx="34" cy="17" r="4.8" fill="#ffffff" stroke="#1f6319" strokeWidth="1.5" />
          <circle cx="25" cy="17" r="2" fill="#162114" />
          <circle cx="35" cy="17" r="2" fill="#162114" />
          <path d="M20 15 L28 15 M30 15 L38 15" stroke="#45b63b" strokeWidth="2.2" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
          <polygon points="4,4 8,12 12,4 16,12 20,4" fill="#ffffff" stroke="#1f6319" strokeWidth="1.2" />
          <path d="M20 10 Q28 11 30 17 Q23 18 18 14 Z" fill="#4ec240" stroke="#1f6319" strokeWidth="1.5" />
        </svg>
      </>
    ),
  },

  "olivia-rodrigo": {
    bg: "linear-gradient(135deg, #dcd0ff 0%, #c4b0fa 100%)",
    border: "2px solid #8c6be6",
    textColor: "#1f1438",
    radius: "21px",
    shadow: "0 4px 12px rgba(139, 92, 246, 0.25)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
          <g transform="translate(14,14)">
            <circle cx="0" cy="-6" r="4.5" fill="#9333ea" />
            <circle cx="5.7" cy="-1.8" r="4.5" fill="#a855f7" />
            <circle cx="3.5" cy="4.8" r="4.5" fill="#9333ea" />
            <circle cx="-3.5" cy="4.8" r="4.5" fill="#a855f7" />
            <circle cx="-5.7" cy="-1.8" r="4.5" fill="#7e22ce" />
            <circle cx="0" cy="0" r="3.2" fill="#fde047" />
          </g>
          <path d="M27 5 L28 8 L31 9 L28 10 L27 13 L26 10 L23 9 L26 8 Z" fill="#ffffff" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="32" height="28" viewBox="0 0 32 28" aria-hidden="true">
          <g transform="translate(18,15) scale(0.88)">
            <circle cx="0" cy="-6" r="4.5" fill="#7e22ce" />
            <circle cx="5.7" cy="-1.8" r="4.5" fill="#a855f7" />
            <circle cx="3.5" cy="4.8" r="4.5" fill="#9333ea" />
            <circle cx="-3.5" cy="4.8" r="4.5" fill="#a855f7" />
            <circle cx="-5.7" cy="-1.8" r="4.5" fill="#9333ea" />
            <circle cx="0" cy="0" r="3.2" fill="#fde047" />
          </g>
        </svg>
      </>
    ),
  },

  "frog-duck": {
    bg: "linear-gradient(135deg, #fff8cc 0%, #ffec9e 100%)",
    border: "2px solid #e3b93b",
    textColor: "#261f0c",
    radius: "21px",
    padExtra: { top: 6, right: 10 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
          <circle cx="11" cy="10" r="4.2" fill="#6fd649" stroke="#285918" strokeWidth="1.4" />
          <circle cx="21" cy="10" r="4.2" fill="#6fd649" stroke="#285918" strokeWidth="1.4" />
          <ellipse cx="16" cy="16" rx="11" ry="7.5" fill="#6fd649" stroke="#285918" strokeWidth="1.4" />
          <circle cx="11" cy="10" r="1.6" fill="#182612" />
          <circle cx="21" cy="10" r="1.6" fill="#182612" />
          <path d="M13 16.5 Q16 19 19 16.5" fill="none" stroke="#285918" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
          <circle cx="18" cy="16" r="9.5" fill="#ffe047" stroke="#855a08" strokeWidth="1.5" />
          <circle cx="15" cy="14" r="1.5" fill="#231906" />
          <circle cx="21.5" cy="14" r="1.5" fill="#231906" />
          <ellipse cx="18.2" cy="17.8" rx="4" ry="2.2" fill="#ff841f" stroke="#855a08" strokeWidth="1.1" />
        </svg>
      </>
    ),
  },

  "flexing-cat": {
    bg: "linear-gradient(135deg, #fff1de 0%, #ffe2be 100%)",
    border: "2px solid #df9b52",
    textColor: "#291a0c",
    radius: "21px",
    padExtra: { left: 14, right: 10 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-left-center" width="32" height="34" viewBox="0 0 32 34" aria-hidden="true">
          {/* Muscular flexing cat arm */}
          <path
            d="M25 26 C14 28, 7 22, 9 13 C10 8, 16 7, 18 11 C19 13, 16 16, 15 16 C19 15, 24 17, 25 22 Z"
            fill="#f7a94b"
            stroke="#6e3d0b"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M17 19 Q20 17 22 20" fill="none" stroke="#6e3d0b" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <svg className="bs-deco bs-top-right" width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
          <polygon points="7,13 10,4 16,10" fill="#f7a94b" stroke="#6e3d0b" strokeWidth="1.4" />
          <polygon points="27,13 24,4 18,10" fill="#f7a94b" stroke="#6e3d0b" strokeWidth="1.4" />
          <ellipse cx="17" cy="17" rx="10.5" ry="8.5" fill="#f7a94b" stroke="#6e3d0b" strokeWidth="1.5" />
          <circle cx="13.5" cy="16" r="1.5" fill="#2b1704" />
          <circle cx="20.5" cy="16" r="1.5" fill="#2b1704" />
          <path d="M14 19.5 Q17 21.8 20.5 19" fill="none" stroke="#2b1704" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </>
    ),
  },

  capybara: {
    bg: "linear-gradient(135deg, #f3fad8 0%, #e1f1b8 100%)",
    border: "2px solid #96b858",
    textColor: "#222914",
    radius: "21px",
    padExtra: { right: 16 },
    renderDecorations: () => (
      <svg className="bs-deco bs-right-center" width="38" height="42" viewBox="0 0 38 42" aria-hidden="true">
        {/* Tangerine on head */}
        <circle cx="20" cy="9" r="4.6" fill="#ff8c1a" stroke="#783900" strokeWidth="1.3" />
        <path d="M20 4.5 Q23 2 24 4.8" fill="#46b038" stroke="#1e5917" strokeWidth="1" />
        {/* Capybara head */}
        <circle cx="12" cy="15" r="3" fill="#8f5c38" stroke="#452814" strokeWidth="1.3" />
        <ellipse cx="19" cy="23" rx="12" ry="10.5" fill="#ab7148" stroke="#452814" strokeWidth="1.6" />
        <ellipse cx="24" cy="24" rx="6.2" ry="5.2" fill="#8a5632" />
        <line x1="14" y1="20" x2="18" y2="20" stroke="#29160a" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="25.5" cy="22.5" r="1.2" fill="#29160a" />
        <path d="M23 26 Q25 27.5 27 26" fill="none" stroke="#29160a" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },

  frog: {
    bg: "linear-gradient(180deg, #7ae05c 0%, #58c43b 100%)",
    border: "2px solid #236912",
    textColor: "#0e200a",
    radius: "22px",
    padExtra: { top: 8 },
    shadow: "0 4px 12px rgba(68, 171, 41, 0.3)",
    renderDecorations: () => (
      <svg className="bs-deco bs-top-center" width="60" height="24" viewBox="0 0 60 24" aria-hidden="true">
        <circle cx="18" cy="12" r="8.5" fill="#62cf44" stroke="#236912" strokeWidth="1.7" />
        <circle cx="42" cy="12" r="8.5" fill="#62cf44" stroke="#236912" strokeWidth="1.7" />
        <circle cx="18" cy="12" r="5.5" fill="#ffffff" />
        <circle cx="42" cy="12" r="5.5" fill="#ffffff" />
        <circle cx="18.5" cy="12" r="3" fill="#13210f" />
        <circle cx="41.5" cy="12" r="3" fill="#13210f" />
        <circle cx="19.5" cy="10.8" r="1" fill="#ffffff" />
        <circle cx="42.5" cy="10.8" r="1" fill="#ffffff" />
        <ellipse cx="9" cy="19" rx="3.2" ry="1.8" fill="#ff94ac" opacity="0.85" />
        <ellipse cx="51" cy="19" rx="3.2" ry="1.8" fill="#ff94ac" opacity="0.85" />
      </svg>
    ),
  },

  "cat-dog": {
    bg: "linear-gradient(135deg, #fff5ef 0%, #ffe8db 100%)",
    border: "2px solid #f0b698",
    textColor: "#261914",
    radius: "21px",
    padExtra: { top: 6, right: 12 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="34" height="28" viewBox="0 0 34 28" aria-hidden="true">
          {/* White cat */}
          <polygon points="7,14 9,4 16,10" fill="#ffffff" stroke="#5c4338" strokeWidth="1.4" />
          <polygon points="27,14 25,4 18,10" fill="#ffffff" stroke="#5c4338" strokeWidth="1.4" />
          <ellipse cx="17" cy="16.5" rx="10.5" ry="8" fill="#ffffff" stroke="#5c4338" strokeWidth="1.4" />
          <circle cx="13.5" cy="16" r="1.4" fill="#2c1d16" />
          <circle cx="20.5" cy="16" r="1.4" fill="#2c1d16" />
          <polygon points="16,18 18,18 17,19.5" fill="#ff8da6" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="36" height="30" viewBox="0 0 36 30" aria-hidden="true">
          {/* Golden puppy */}
          <ellipse cx="8" cy="17" rx="3.5" ry="6.5" fill="#d98a3c" stroke="#5c3614" strokeWidth="1.3" />
          <ellipse cx="28" cy="17" rx="3.5" ry="6.5" fill="#d98a3c" stroke="#5c3614" strokeWidth="1.3" />
          <ellipse cx="18" cy="16" rx="9.5" ry="8" fill="#f7b963" stroke="#5c3614" strokeWidth="1.4" />
          <circle cx="14.8" cy="15" r="1.4" fill="#2c1908" />
          <circle cx="21.2" cy="15" r="1.4" fill="#2c1908" />
          <ellipse cx="18" cy="17.8" rx="2" ry="1.4" fill="#3b210b" />
          <ellipse cx="18" cy="21.5" rx="2" ry="2.6" fill="#ff758f" />
        </svg>
      </>
    ),
  },

  facepalm: {
    bg: "linear-gradient(135deg, #ebf0ff 0%, #d9e3ff 100%)",
    border: "2px solid #8ea6f2",
    textColor: "#171f38",
    radius: "21px",
    padExtra: { top: 8, right: 10 },
    renderDecorations: () => (
      <svg className="bs-deco bs-top-right" width="44" height="32" viewBox="0 0 44 32" aria-hidden="true">
        {/* Hair + facepalm hand + blue sweat drop */}
        <circle cx="21" cy="17" r="10.5" fill="#ffe1c9" stroke="#2c2538" strokeWidth="1.5" />
        <path d="M10 16 C10 6, 32 6, 32 16 C29 11, 14 11, 10 16 Z" fill="#252136" />
        <path d="M15 24 L22 13 C24 12, 27 14, 25 17 L20 26 Z" fill="#ffd2b0" stroke="#2c2538" strokeWidth="1.3" />
        <line x1="13" y1="18" x2="17" y2="19" stroke="#2c2538" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M36 9 C38 13, 39 16, 36 18 C33 16, 34 13, 36 9 Z" fill="#38bdf8" stroke="#0369a1" strokeWidth="1.1" />
      </svg>
    ),
  },

  "heart-pepe": {
    bg: "linear-gradient(135deg, #ffeaf0 0%, #ffd5e3 100%)",
    border: "2px solid #f78fb3",
    textColor: "#29141d",
    radius: "21px",
    padExtra: { left: 16 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-left-center" width="40" height="38" viewBox="0 0 40 38" aria-hidden="true">
          <circle cx="13" cy="12" r="4.5" fill="#63c74d" stroke="#215217" strokeWidth="1.4" />
          <circle cx="22" cy="12" r="4.5" fill="#63c74d" stroke="#215217" strokeWidth="1.4" />
          <ellipse cx="18" cy="20" rx="11" ry="9" fill="#63c74d" stroke="#215217" strokeWidth="1.5" />
          <circle cx="13.5" cy="12.5" r="2" fill="#ffffff" />
          <circle cx="21.5" cy="12.5" r="2" fill="#ffffff" />
          <circle cx="14" cy="12.5" r="1.1" fill="#111" />
          <circle cx="22" cy="12.5" r="1.1" fill="#111" />
          <path d="M12 22 Q18 25 24 22" fill="none" stroke="#c94a38" strokeWidth="2.2" strokeLinecap="round" />
          {/* Pepe holding big red heart */}
          <path
            d="M28 22 C28 19, 33 19, 33 22 C33 19, 38 19, 38 22 C38 26, 33 29, 33 30 C33 29, 28 26, 28 22 Z"
            fill="#ef4444"
            stroke="#881337"
            strokeWidth="1.2"
          />
        </svg>
        <svg className="bs-deco bs-top-right" width="24" height="22" viewBox="0 0 24 22" aria-hidden="true">
          <path
            d="M8 9 C8 6.5, 12 6.5, 12 9 C12 6.5, 16 6.5, 16 9 C16 12.5, 12 15, 12 16 C12 15, 8 12.5, 8 9 Z"
            fill="#fb7185"
          />
        </svg>
      </>
    ),
  },

  "pig-shark": {
    bg: "linear-gradient(135deg, #e6f5ff 0%, #cde9ff 100%)",
    border: "2px solid #75b8f0",
    textColor: "#142638",
    radius: "21px",
    padExtra: { left: 16, right: 10 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-left-center" width="38" height="36" viewBox="0 0 38 36" aria-hidden="true">
          {/* Shark hood + cute pink pig face */}
          <path d="M15 4 L22 10 L13 11 Z" fill="#5aa9e6" stroke="#1e4e79" strokeWidth="1.4" />
          <circle cx="19" cy="20" r="11" fill="#5aa9e6" stroke="#1e4e79" strokeWidth="1.5" />
          <ellipse cx="20" cy="21" rx="8" ry="7" fill="#ffc2d4" />
          <circle cx="17" cy="19.5" r="1.3" fill="#231820" />
          <circle cx="23" cy="19.5" r="1.3" fill="#231820" />
          <ellipse cx="20" cy="22.5" rx="3.2" ry="2.1" fill="#ff94b2" stroke="#9e3b58" strokeWidth="1" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="28" height="26" viewBox="0 0 28 26" aria-hidden="true">
          <path d="M8 18 Q16 16 21 8 Q21 16 26 21 Q17 22 8 18 Z" fill="#5aa9e6" stroke="#1e4e79" strokeWidth="1.4" />
        </svg>
      </>
    ),
  },

  "tongue-bear": {
    bg: "#fffafa",
    border: "3px solid #ff8fab",
    textColor: "#26161b",
    radius: "22px",
    padExtra: { left: 18 },
    shadow: "0 4px 12px rgba(255, 143, 171, 0.28)",
    renderDecorations: () => (
      <svg className="bs-deco bs-left-center" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="10" cy="11" r="4" fill="#9c6644" stroke="#472a17" strokeWidth="1.4" />
        <circle cx="25" cy="11" r="4" fill="#9c6644" stroke="#472a17" strokeWidth="1.4" />
        <circle cx="17.5" cy="20" r="11" fill="#b0754f" stroke="#472a17" strokeWidth="1.5" />
        <ellipse cx="18" cy="22" rx="5.5" ry="4.5" fill="#f5dcc4" />
        <circle cx="14" cy="17.5" r="1.4" fill="#211209" />
        <circle cx="21" cy="17.5" r="1.4" fill="#211209" />
        <ellipse cx="18" cy="20" rx="2" ry="1.4" fill="#361d0e" />
        {/* Big pink tongue wrapping into the bubble */}
        <path d="M16 23 C22 23, 31 21, 38 24 C31 29, 21 29, 16 25 Z" fill="#ff8fab" stroke="#ad3959" strokeWidth="1.3" />
      </svg>
    ),
  },

  doge: {
    bg: "linear-gradient(135deg, #fff3cf 0%, #ffe299 100%)",
    border: "2px solid #dba03b",
    textColor: "#291c06",
    radius: "21px",
    padExtra: { left: 16, right: 8 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-left-center" width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
          <polygon points="8,14 10,4 17,10" fill="#e6a645" stroke="#66410d" strokeWidth="1.4" />
          <polygon points="29,14 27,4 20,10" fill="#e6a645" stroke="#66410d" strokeWidth="1.4" />
          <ellipse cx="18.5" cy="20" rx="11" ry="10" fill="#f0b556" stroke="#66410d" strokeWidth="1.5" />
          <ellipse cx="18.5" cy="22.5" rx="7.5" ry="6" fill="#fff5df" />
          {/* Iconic Doge side-eye */}
          <ellipse cx="15" cy="18" rx="2.1" ry="1.5" fill="#ffffff" stroke="#2b1b05" strokeWidth="1" />
          <ellipse cx="22" cy="18" rx="2.1" ry="1.5" fill="#ffffff" stroke="#2b1b05" strokeWidth="1" />
          <circle cx="15.8" cy="18" r="1" fill="#1c1204" />
          <circle cx="22.8" cy="18" r="1" fill="#1c1204" />
          <ellipse cx="18.5" cy="21" rx="2" ry="1.4" fill="#241706" />
          <path d="M15.5 24 Q18.5 25.8 22 23.5" fill="none" stroke="#241706" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 12 L10 6 C10 4, 14 4, 14 7 L14 11 L18 11 C20 11, 20 18, 16 18 L10 18 Z" fill="#f0b556" stroke="#66410d" strokeWidth="1.3" />
        </svg>
      </>
    ),
  },

  "frog-chick": {
    bg: "linear-gradient(180deg, #ffffff 0%, #e6f6ff 100%)",
    border: "2px solid #8fd3f4",
    textColor: "#142736",
    radius: "18px 18px 24px 24px",
    padExtra: { top: 10 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-center" width="66" height="28" viewBox="0 0 66 28" aria-hidden="true">
          {/* Bubble bath foam + frog + yellow chick */}
          <circle cx="14" cy="20" r="6" fill="#ffffff" stroke="#bae6fd" strokeWidth="1.2" />
          <circle cx="24" cy="19" r="7" fill="#ffffff" stroke="#bae6fd" strokeWidth="1.2" />
          <circle cx="42" cy="19" r="7" fill="#ffffff" stroke="#bae6fd" strokeWidth="1.2" />
          <circle cx="52" cy="20" r="6" fill="#ffffff" stroke="#bae6fd" strokeWidth="1.2" />
          {/* Frog */}
          <ellipse cx="25" cy="14" rx="7.5" ry="6" fill="#67d149" stroke="#235c14" strokeWidth="1.3" />
          <circle cx="22.5" cy="12" r="1.3" fill="#162912" />
          <circle cx="27.5" cy="12" r="1.3" fill="#162912" />
          {/* Chick */}
          <circle cx="41" cy="14" r="6" fill="#ffe14d" stroke="#855a08" strokeWidth="1.3" />
          <circle cx="39" cy="13" r="1.1" fill="#211704" />
          <circle cx="43" cy="13" r="1.1" fill="#211704" />
          <polygon points="40,15 42,15 41,17" fill="#ff7b1c" />
        </svg>
        <svg className="bs-deco bs-bottom-left" width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
          <ellipse cx="10" cy="9" rx="4.5" ry="3" fill="#fbbf24" stroke="#92400e" strokeWidth="1.2" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
          <ellipse cx="8" cy="9" rx="4.5" ry="3" fill="#fbbf24" stroke="#92400e" strokeWidth="1.2" />
        </svg>
      </>
    ),
  },

  "hungry-dog": {
    bg: "linear-gradient(180deg, #f5a076 0%, #e07c4f 100%)",
    border: "2px solid #6e290f",
    textColor: "#1c0a03",
    radius: "22px",
    padExtra: { top: 8, bottom: 4 },
    shadow: "0 4px 12px rgba(184, 82, 42, 0.3)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-center" width="56" height="24" viewBox="0 0 56 24" aria-hidden="true">
          <ellipse cx="10" cy="14" rx="4.5" ry="7" fill="#8c3718" stroke="#4d1a07" strokeWidth="1.3" />
          <ellipse cx="46" cy="14" rx="4.5" ry="7" fill="#8c3718" stroke="#4d1a07" strokeWidth="1.3" />
          <circle cx="21" cy="12" r="4.2" fill="#ffffff" stroke="#4d1a07" strokeWidth="1.3" />
          <circle cx="35" cy="12" r="4.2" fill="#ffffff" stroke="#4d1a07" strokeWidth="1.3" />
          <circle cx="21.5" cy="12" r="2" fill="#1f0d05" />
          <circle cx="34.5" cy="12" r="2" fill="#1f0d05" />
          <ellipse cx="28" cy="16" rx="3.4" ry="2.3" fill="#2b1106" />
        </svg>
        <svg className="bs-deco bs-bottom-center" width="46" height="16" viewBox="0 0 46 16" aria-hidden="true">
          <polygon points="8,3 12,9 16,3 20,8 26,8 30,3 34,9 38,3" fill="#ffffff" stroke="#5c210b" strokeWidth="1" />
          <ellipse cx="23" cy="10" rx="6" ry="3.5" fill="#ff85a1" />
        </svg>
      </>
    ),
  },

  dino: {
    bg: "linear-gradient(135deg, #e4fad9 0%, #c8f2b6 100%)",
    border: "2.2px solid #52b83b",
    textColor: "#162912",
    radius: "20px",
    padExtra: { left: 14, right: 10 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-top-left" width="38" height="30" viewBox="0 0 38 30" aria-hidden="true">
          <polygon points="6,12 10,5 14,10 18,4 22,10" fill="#3b9427" />
          <path d="M6 22 C6 10, 26 8, 30 16 L20 20 L27 24 L10 25 Z" fill="#5ec947" stroke="#205714" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="18" cy="14" r="1.8" fill="#ffffff" />
          <circle cx="18.5" cy="14" r="1" fill="#12210e" />
          <polygon points="21,19 23,22 25,18 27,21 29,17" fill="#ffffff" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="28" height="24" viewBox="0 0 28 24" aria-hidden="true">
          <path d="M6 16 Q17 17 24 8 Q23 19 10 21 Z" fill="#5ec947" stroke="#205714" strokeWidth="1.5" />
        </svg>
      </>
    ),
  },

  dachshund: {
    bg: "linear-gradient(90deg, #6b381d 0%, #522812 100%)",
    border: "2px solid #381a0a",
    textColor: "#ffffff",
    radius: "24px",
    padExtra: { left: 18, right: 10 },
    shadow: "0 4px 12px rgba(74, 36, 16, 0.34)",
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-left-center" width="38" height="36" viewBox="0 0 38 36" aria-hidden="true">
          {/* Sausage dog head + floppy ear + long snout */}
          <ellipse cx="22" cy="19" rx="10" ry="9" fill="#8f4c29" stroke="#3d1d0c" strokeWidth="1.5" />
          <ellipse cx="27" cy="21" rx="4.8" ry="8" fill="#592b13" stroke="#3d1d0c" strokeWidth="1.3" />
          <path d="M20 15 C11 15, 4 17, 5 22 C6 25, 14 25, 20 23 Z" fill="#8f4c29" stroke="#3d1d0c" strokeWidth="1.5" />
          <circle cx="5.5" cy="19.5" r="2.2" fill="#1f0e05" />
          <circle cx="18" cy="16.5" r="1.6" fill="#1f0e05" />
          <circle cx="19" cy="14" r="1.3" fill="#e09f67" />
        </svg>
        <svg className="bs-deco bs-bottom-right" width="28" height="26" viewBox="0 0 28 26" aria-hidden="true">
          <path d="M9 17 Q19 15 24 6" fill="none" stroke="#8f4c29" strokeWidth="4.2" strokeLinecap="round" />
          <ellipse cx="8" cy="21" rx="4" ry="2.6" fill="#d9955b" stroke="#3d1d0c" strokeWidth="1.2" />
        </svg>
      </>
    ),
  },

  "hungry-frog": {
    bg: "linear-gradient(135deg, #fff0f4 0%, #ffe0ea 100%)",
    border: "2.4px solid #ff85a8",
    textColor: "#26151c",
    radius: "21px",
    padExtra: { left: 16, right: 10 },
    renderDecorations: () => (
      <>
        <svg className="bs-deco bs-bottom-left" width="36" height="32" viewBox="0 0 36 32" aria-hidden="true">
          <circle cx="11" cy="12" r="4" fill="#63cf48" stroke="#215914" strokeWidth="1.3" />
          <circle cx="20" cy="12" r="4" fill="#63cf48" stroke="#215914" strokeWidth="1.3" />
          <ellipse cx="16" cy="19" rx="10.5" ry="8" fill="#63cf48" stroke="#215914" strokeWidth="1.5" />
          <circle cx="11" cy="12" r="1.4" fill="#13240e" />
          <circle cx="20" cy="12" r="1.4" fill="#13240e" />
          {/* Frog tongue shooting out */}
          <path d="M18 20 Q27 17 35 10" fill="none" stroke="#ff7096" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
        <svg className="bs-deco bs-top-right" width="28" height="26" viewBox="0 0 28 26" aria-hidden="true">
          {/* Little butterfly caught on the corner */}
          <ellipse cx="11" cy="11" rx="4.5" ry="3.2" transform="rotate(-25 11 11)" fill="#60a5fa" stroke="#1e3a8a" strokeWidth="1.1" />
          <ellipse cx="18" cy="14" rx="4.5" ry="3.2" transform="rotate(25 18 14)" fill="#fde047" stroke="#854d0e" strokeWidth="1.1" />
          <line x1="12" y1="16" x2="17" y2="9" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </>
    ),
  },
};

/**
 * Miniature 1:1 preview pill shown inside the 3-column "Suggested" Bubble Style sheet.
 */
export function BubblePreviewThumb({ styleId }: { styleId: BubbleStyleId }) {
  if (styleId === "default") {
    return (
      <div className="bs-thumb-stage">
        <div className="bs-thumb-pill bs-thumb-default">
          <span className="bs-thumb-line bs-thumb-line-lg" />
          <span className="bs-thumb-line bs-thumb-line-sm" />
          <span className="bs-thumb-tail" />
        </div>
      </div>
    );
  }

  const spec = BUBBLE_SPECS[styleId];
  const meta = getBubbleStyleMeta(styleId);
  const lineBg =
    meta.tone === "light-bg" ? "rgba(25, 28, 38, 0.28)" : "rgba(255, 255, 255, 0.72)";

  return (
    <div className="bs-thumb-stage">
      <div
        className="bs-thumb-pill"
        style={{
          background: spec.bg,
          border: spec.border,
          borderRadius: spec.radius ?? "20px",
          boxShadow: spec.shadow,
        }}
      >
        {spec.renderDecorations()}
        <span className="bs-thumb-line bs-thumb-line-lg" style={{ background: lineBg }} />
        <span className="bs-thumb-line bs-thumb-line-sm" style={{ background: lineBg }} />
      </div>
    </div>
  );
}

interface DecoratedMessageBubbleProps extends HTMLAttributes<HTMLDivElement> {
  styleId: BubbleStyleId;
  mine: boolean;
  unsent?: boolean;
  mentioned?: boolean;
  children: ReactNode;
}

/**
 * Renders a live message bubble in DM, Group, or Community chat.
 * Falls back cleanly to standard `.bubble` when `styleId === "default"` or `unsent`.
 */
export function DecoratedMessageBubble({
  styleId,
  mine,
  unsent,
  mentioned,
  className = "",
  style,
  children,
  ...rest
}: DecoratedMessageBubbleProps) {
  const baseClass = `bubble ${mine ? "mine" : ""} ${unsent ? "unsent" : ""} ${
    mentioned ? "mentioned-bubble" : ""
  } ${className}`.trim();

  if (unsent || styleId === "default") {
    return (
      <div className={baseClass} style={style} {...rest}>
        {children}
      </div>
    );
  }

  const spec = BUBBLE_SPECS[styleId];
  const meta = getBubbleStyleMeta(styleId);
  const padTop = 10 + (spec.padExtra?.top ?? 0);
  const padRight = 14 + (spec.padExtra?.right ?? 0);
  const padBottom = 10 + (spec.padExtra?.bottom ?? 0);
  const padLeft = 14 + (spec.padExtra?.left ?? 0);

  const customStyle: CSSProperties = {
    ...style,
    background: spec.bg,
    border: spec.border,
    color: spec.textColor,
    borderRadius: spec.radius ?? "20px",
    boxShadow: spec.shadow,
    padding: `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`,
  };

  return (
    <div
      className={`${baseClass} styled-bubble styled-bubble-${meta.tone}`}
      data-bubble-style={styleId}
      style={customStyle}
      {...rest}
    >
      {spec.renderDecorations()}
      <div className="styled-bubble-inner">{children}</div>
    </div>
  );
}
