"""Validate editor drafts and normalize Adobe's duration-based word timestamps."""
import math


def clean_transcript(data, adobe=False):
    if not isinstance(data, dict) or not isinstance(data.get('segments'), list) or not 0 < len(data['segments']) <= 10000:
        raise ValueError('Ajoute au moins un sous-titre.')
    segments, count = [], 0

    def number(value):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 86400:
            raise ValueError('Timing de sous-titre invalide.')
        return float(value)

    last_end = 0
    for segment in data['segments']:
        if not isinstance(segment, dict) or not isinstance(segment.get('words', []), list):
            raise ValueError('Sous-titre invalide.')
        start = number(segment.get('start'))
        end = number(start + number(segment.get('duration')) if adobe else segment.get('end'))
        if end <= start or start < last_end - .05:
            raise ValueError('Ordre des sous-titres invalide.')
        words, last_word = [], start
        for word in segment.get('words', []):
            count += 1
            if not isinstance(word, dict):
                raise ValueError('Mot invalide.')
            text = word.get('text', word.get('word', ''))
            a = number(word.get('start'))
            b = number(a + number(word.get('duration')) if adobe else word.get('end'))
            if not isinstance(text, str) or len(text) > 200 or b < a or a < start - .05 or b > end + .05 or a < last_word - .05 or count > 100000:
                raise ValueError('Mot ou timing invalide.')
            words.append(dict(text=text, start=a, end=b, confidence=1))
            last_word = b
        text = ' '.join(word['text'] for word in words) if adobe else segment.get('text')
        if not isinstance(text, str) or len(text) > 4000:
            raise ValueError('Texte de sous-titre invalide.')
        segments.append(dict(start=start, end=end, text=text, words=words))
        last_end = end
    language = data.get('language', 'fr')
    return dict(segments=segments, duration=max(item['end'] for item in segments),
        language=language if isinstance(language, str) and len(language) <= 32 else 'fr')
