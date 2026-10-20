/* Generated from service/module_catalog.py. */
window.NocturnzModules = [
  {
    "id": "transcription",
    "title": "Transcription",
    "action": "Transcrire",
    "fields": [
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      }
    ],
    "upstream": [
      "captions.transcribe"
    ]
  },
  {
    "id": "hesitations",
    "title": "Hésitations",
    "action": "Détecter",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "words",
        "label": "Mots à retirer",
        "type": "text",
        "default": "euh,heu,hum"
      }
    ],
    "upstream": [
      "fillers.detect_fillers",
      "premiere.export_premiere_xml_from_cuts"
    ]
  },
  {
    "id": "repetitions",
    "title": "Répétitions",
    "action": "Détecter",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "threshold",
        "label": "Similarité",
        "type": "number",
        "default": 0.6,
        "min": 0.1,
        "max": 1,
        "step": 0.05
      }
    ],
    "upstream": [
      "repeat_detect.detect_repeated_takes"
    ]
  },
  {
    "id": "captions",
    "title": "Sous-titres",
    "action": "Générer",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "format",
        "label": "Format",
        "type": "select",
        "default": "animated",
        "choices": [
          "srt",
          "vtt",
          "ass",
          "animated"
        ]
      },
      {
        "key": "style",
        "label": "Style animé",
        "type": "select",
        "default": "nocturnz",
        "choices": [
          "nocturnz",
          "youtube_bold",
          "clean_modern",
          "neon_pop",
          "minimal"
        ]
      }
    ],
    "upstream": [
      "export.srt",
      "styled_captions.render_styled_caption_video"
    ]
  },
  {
    "id": "podcast",
    "title": "Podcast",
    "action": "Préparer le montage",
    "multiple": true,
    "fields": [
      {
        "key": "segments",
        "label": "Prises de parole JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "minCut",
        "label": "Plan minimum (s)",
        "type": "number",
        "default": 1,
        "min": 0.2,
        "max": 60,
        "step": 0.1
      }
    ],
    "upstream": [
      "audio.analyze_energy",
      "multicam.generate_multicam_cuts"
    ]
  },
  {
    "id": "cadrages",
    "title": "Cadrages",
    "action": "Créer le rendu",
    "multiple": true,
    "fields": [
      {
        "key": "layout",
        "label": "Disposition",
        "type": "select",
        "default": "side_by_side",
        "choices": [
          "side_by_side",
          "2x2_grid",
          "pip_top_right"
        ]
      },
      {
        "key": "width",
        "label": "Largeur",
        "type": "number",
        "default": 1920,
        "min": 128,
        "max": 7680
      },
      {
        "key": "height",
        "label": "Hauteur",
        "type": "number",
        "default": 1080,
        "min": 128,
        "max": 7680
      }
    ],
    "upstream": [
      "split_screen.create_split_screen",
      "multicam_grid.export_multicam_grid"
    ]
  },
  {
    "id": "recadrage",
    "title": "Recadrage",
    "action": "Créer le rendu",
    "fields": [
      {
        "key": "aspect",
        "label": "Format",
        "type": "select",
        "default": "9:16",
        "choices": [
          "9:16",
          "1:1",
          "4:5",
          "16:9"
        ]
      },
      {
        "key": "method",
        "label": "Cadrage",
        "type": "select",
        "default": "center",
        "choices": [
          "center",
          "auto",
          "face"
        ]
      }
    ],
    "upstream": [
      "smart_reframe.reframe_vertical"
    ]
  },
  {
    "id": "shorts",
    "title": "Shorts",
    "action": "Proposer les extraits",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "selection",
        "label": "Sélection",
        "type": "select",
        "default": "heuristic",
        "choices": [
          "heuristic",
          "ollama"
        ]
      },
      {
        "key": "count",
        "label": "Extraits",
        "type": "number",
        "default": 3,
        "min": 1,
        "max": 20
      },
      {
        "key": "minDuration",
        "label": "Durée minimum (s)",
        "type": "number",
        "default": 15,
        "min": 1,
        "max": 300
      },
      {
        "key": "maxDuration",
        "label": "Durée maximum (s)",
        "type": "number",
        "default": 60,
        "min": 1,
        "max": 600
      }
    ],
    "upstream": [
      "highlights.extract_highlights"
    ]
  },
  {
    "id": "chapitres",
    "title": "Chapitres",
    "action": "Générer",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "count",
        "label": "Chapitres maximum",
        "type": "number",
        "default": 15,
        "min": 1,
        "max": 100
      },
      {
        "key": "minDuration",
        "label": "Durée minimum (s)",
        "type": "number",
        "default": 30,
        "min": 1,
        "max": 3600
      }
    ],
    "upstream": [
      "chapter_gen.generate_chapters"
    ]
  },
  {
    "id": "broll",
    "title": "B-roll",
    "action": "Proposer les plans",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "footage",
        "label": "Plans disponibles",
        "type": "files",
        "default": [],
        "optional": true
      },
      {
        "key": "count",
        "label": "Suggestions",
        "type": "number",
        "default": 20,
        "min": 1,
        "max": 100
      }
    ],
    "upstream": [
      "broll_suggest.suggest_broll"
    ]
  },
  {
    "id": "audio",
    "title": "Audio",
    "action": "Créer le rendu",
    "fields": [
      {
        "key": "operation",
        "label": "Traitement",
        "type": "select",
        "default": "normalize",
        "choices": [
          "normalize",
          "denoise",
          "duck"
        ]
      },
      {
        "key": "lufs",
        "label": "Niveau LUFS",
        "type": "number",
        "default": -14,
        "min": -70,
        "max": -1
      },
      {
        "key": "music",
        "label": "Musique pour ducking",
        "type": "file",
        "default": "",
        "optional": true
      }
    ],
    "upstream": [
      "loudness_match.normalize_to_lufs",
      "audio_duck.mix_with_duck"
    ]
  },
  {
    "id": "musique",
    "title": "Musique",
    "action": "Créer le rendu",
    "sourceOptional": true,
    "fields": [
      {
        "key": "operation",
        "label": "Traitement",
        "type": "select",
        "default": "fit",
        "choices": [
          "fit",
          "tone",
          "sfx"
        ]
      },
      {
        "key": "duration",
        "label": "Durée cible (s)",
        "type": "number",
        "default": 30,
        "min": 0.1,
        "max": 14400,
        "step": 0.1
      },
      {
        "key": "frequency",
        "label": "Fréquence (Hz)",
        "type": "number",
        "default": 440,
        "min": 20,
        "max": 20000
      },
      {
        "key": "preset",
        "label": "Effet sonore",
        "type": "select",
        "default": "swoosh",
        "choices": [
          "swoosh",
          "rise",
          "impact",
          "click"
        ]
      }
    ],
    "upstream": [
      "music_remix.fit_music_to_duration",
      "music_gen.generate_tone",
      "music_gen.generate_sfx"
    ]
  },
  {
    "id": "censure",
    "title": "Censure",
    "action": "Créer le rendu",
    "fields": [
      {
        "key": "transcript",
        "label": "Transcription JSON",
        "type": "file",
        "default": "",
        "extensions": [
          "json"
        ],
        "optional": true
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      },
      {
        "key": "operation",
        "label": "Traitement",
        "type": "select",
        "default": "bleep",
        "choices": [
          "bleep",
          "mute",
          "faces"
        ]
      },
      {
        "key": "words",
        "label": "Mots à censurer",
        "type": "text",
        "default": ""
      }
    ],
    "upstream": [
      "profanity_censor.censor",
      "redaction.redact_faces"
    ]
  },
  {
    "id": "recettes",
    "title": "Recettes",
    "action": "Exécuter la recette",
    "fields": [
      {
        "key": "recipe",
        "label": "Recette",
        "type": "select",
        "default": "interview",
        "choices": [
          "interview",
          "social",
          "audio"
        ]
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      }
    ],
    "upstream": [
      "macro_recorder.play_macro"
    ]
  },
  {
    "id": "lots",
    "title": "Traitement par lot",
    "action": "Lancer le lot",
    "multiple": true,
    "fields": [
      {
        "key": "module",
        "label": "Outil",
        "type": "select",
        "default": "transcription",
        "choices": [
          "transcription",
          "captions",
          "recadrage",
          "audio",
          "chapitres",
          "hesitations",
          "repetitions"
        ]
      },
      {
        "key": "language",
        "label": "Langue",
        "type": "select",
        "default": "fr",
        "choices": [
          "fr",
          "ar",
          "en",
          "auto"
        ]
      },
      {
        "key": "model",
        "label": "Modèle",
        "type": "select",
        "default": "base",
        "choices": [
          "tiny",
          "base",
          "small"
        ]
      }
    ],
    "upstream": [
      "batch_process.create_batch",
      "batch_process.update_batch_item",
      "batch_process.finalize_batch"
    ]
  }
];
