// Default settings. Everything is stored locally in %APPDATA%\RAAssistant\settings.json.
module.exports = {
  firstRun: true,
  lang: 'id',
  autostart: true,
  appearance: {
    style: 'pill',            // pill | notch
    content: 'clock-battery', // clock-battery | clock-mascot | mascot
    theme: 'graphite',        // graphite | frost | lagoon | covertint | coverglow
    accent: '#8b7cff',
    size: 'auto',             // auto | 75 | 90 | 100 | 115 | 130
    monitor: 'primary'        // primary | <display id>
  },
  behaviour: {
    visibility: 'always',     // always | activity | hidden
    musicFullscreen: true,
    onTop: 'shrink',          // full | shrink
    clockPill: 'time',        // off | time | timedate
    tabs: [
      { id: 'music', show: true }, { id: 'agents', show: true }, { id: 'today', show: true },
      { id: 'prayer', show: true }, { id: 'shelf', show: true }, { id: 'timer', show: true },
      { id: 'reminders', show: true }, { id: 'drink', show: true }, { id: 'capture', show: true },
      { id: 'listen', show: true }, { id: 'screen', show: true }
    ],
    hideApps: [],
    autoHideFullscreen: true,
    noShrinkApps: [],
    // In browsers the island tucks into a tiny notch and only opens when the cursor rests on it.
    browserNotch: true,
    browserApps: ['chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe', 'vivaldi.exe', 'arc.exe', 'zen.exe', 'floorp.exe', 'librewolf.exe', 'waterfox.exe', 'thorium.exe', 'comet.exe'],
    hoverZone: 'tight',       // tight (only the visible notch/pill) | wide
    hoverDelay: 250           // ms the cursor must rest on a shrunk island before it opens
  },
  mascot: {
    eye: '#5eead4',
    accessory: 'none',        // none | glasses | hat | headphones
    eyeMotion: 'relaxed',     // relaxed | follow
    idleShow: true,
    idleAfter: 60,
    battery: true,
    holdItems: true,
    reactions: true
  },
  music: {
    lyrics: true,
    lyricOffset: 0,
    gestures: true
  },
  meetings: {
    auto: true,
    micButton: true,
    ignoreApps: ['discord.exe', 'whatsapp.exe', 'whatsapp.root.exe'],
    bluetooth: true,
    downloads: true,
    internet: true,
    resumeAfterLock: true,
    notifications: true
  },
  today: {
    location: { name: 'Jakarta', region: 'DKI Jakarta', country: 'ID', lat: -6.2088, lon: 106.8456, tz: 'Asia/Jakarta', tzLabel: 'WIB' },
    weather: true,
    rain: true,
    ical: '',
    eventCountdown: true
  },
  worship: {
    mode: 'prayer',           // prayer | custom | off
    remind: true,
    countdown: true,
    pauseMusic: true,
    ramadan: true,
    adzan: true,
    adzanFile: '',
    adzanVolume: 0.8,
    subuhAdzan: true,
    noAdzanInMeeting: true,
    custom: []                // [{ day: 0-6, time: 'HH:MM', title }]
  },
  health: {
    drink: { enabled: true, targetMl: 2000, glassMl: 250, intervalMin: 60, start: '07:00', end: '22:00' },
    eye: { enabled: true, intervalMin: 20 }
  },
  focus: { minutes: 25, breakMin: 5 },
  screen: { track: true },          // screen-time tracking (local only)
  listen: { lang: 'id', model: 'base', source: 'mic' }, // live speech-to-text (offline Whisper); source: mic | system
  capture: {
    shortcut: 'CommandOrControl+Shift+S',
    hideFromCapture: true,
    recordMic: false
  },
  phone: {
    clipboard: false,
    shelf: true,
    skipPasswordManagers: true,
    enabled: false
  },
  agents: {
    copilot: true,
    vscode: true,
    antigravity: true,
    notifyDone: true,
    pill: true
  }
};
