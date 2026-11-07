// 공용 기본 설정 — content script와 popup이 함께 사용
const YTAF_DEFAULTS = {
  enabled: true,
  mode: "hide",            // "hide" | "blur"
  autoBlockLabeled: true,  // 시청 페이지에서 AI 라벨이 보이면 채널 자동 차단
  showBlockButton: true,   // 영상 카드에 🚫 버튼 표시
  shortsAutoSkip: true,    // 쇼츠 플레이어에서 AI 판정 시 다음 쇼츠로 자동 넘김
  hideAllShorts: false,    // 피드의 쇼츠 선반/카드 자체를 전부 숨김
  blockedChannels: {},     // { "@handle" 또는 "UCxxxx": "표시 이름" }
  allowedChannels: {},     // 화이트리스트 (키워드 매칭에서 제외)
  keywords: [
    "AI 생성", "AI로 만든", "AI가 만든", "AI 영상", "AI 노래", "AI 커버",
    "ai generated", "ai-generated", "made with ai", "ai cover", "ai song",
    "sora", "veo 3", "midjourney", "suno", "ai animation", "ai art",
    "#ai", "#aiart", "#aivideo", "#sora", "#veo"
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
