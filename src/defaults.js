// 공용 기본 설정 — content script와 popup이 함께 사용
const YTAF_DEFAULTS = {
  enabled: true,
  mode: "hide",            // "hide" | "blur"
  autoBlockLabeled: true,  // 시청 페이지에서 AI 라벨이 보이면 채널 자동 차단
  autoBlockTts: true,      // 설명란에 AI 음성/TTS 표기가 있으면 채널 자동 차단
  showBlockButton: true,   // 영상 카드에 🚫 버튼 표시
  shortsAutoSkip: true,    // 쇼츠 플레이어에서 AI 판정 시 다음 쇼츠로 자동 넘김
  hideAllShorts: false,    // 피드의 쇼츠 선반/카드 자체를 전부 숨김
  blockedChannels: {},     // { "@handle" 또는 "UCxxxx": "표시 이름" }
  allowedChannels: {},     // 화이트리스트 (키워드 매칭에서 제외)
  keywords: [
    "AI 생성", "AI로 만든", "AI가 만든", "AI 영상", "AI 노래", "AI 커버",
    "ai generated", "ai-generated", "made with ai", "ai cover", "ai song",
    "sora", "veo 3", "midjourney", "suno", "ai animation", "ai art",
    "#ai", "#aiart", "#aivideo", "#sora", "#veo",
    "text to speech", "text-to-speech", "ai voice", "ai narrat", "elevenlabs",
    "AI 음성", "AI 목소리", "AI 더빙", "AI 성우", "AI 내레이션", "AI 나레이션", "#tts",
    "국뽕", "외국인 반응", "외국인들 반응", "해외 반응", "해외반응", "외국인 경악",
    "세계가 놀란", "전세계가 놀란", "전 세계가 놀란", "세계가 경악", "세계가 인정"
  ]
};

// 유튜브가 붙이는 "변경/합성 콘텐츠" 라벨 문구 (언어별)
const YTAF_LABEL_PATTERNS = [
  /altered or synthetic content/i,
  /ai[- ]generated/i,
  /변경되었거나 합성된 콘텐츠/,
  /합성 콘텐츠/,
  /AI로 생성/,
  /AI 생성/,
  /変更または合成されたコンテンツ/,
  /AI 生成/
];

// 설명란의 AI 음성(TTS) 표기 — 시청 페이지 설명에서만 검사
const YTAF_TTS_PATTERNS = [
  /\btts\b/i,
  /text[- ]to[- ]speech/i,
  /elevenlabs/i,
  /\bai[- ]?(voice|narrat\w*|dubb\w*)/i,
  /(AI|인공지능)\s*(음성|목소리|더빙|성우|내레이션|나레이션)/,
  /음성\s*합성/
];
