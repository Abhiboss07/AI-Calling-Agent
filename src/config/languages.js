// ══════════════════════════════════════════════════════════════════════════════
// LANGUAGE REGISTRY — Multilanguage Support for Indian Languages
// ══════════════════════════════════════════════════════════════════════════════
// Maps locale codes to STT (Whisper), TTS (OpenAI), and greeting configuration.

const LANGUAGES = {
    'en-IN': {
        name: 'English (India)',
        whisperCode: 'en',          // Whisper language code
        ttsVoice: 'alloy',          // OpenAI TTS voice
        greeting: 'Hi! How can I help you today?',
        silencePrompt: 'Are you still there? I am happy to help you.',
        farewell: 'Thank you for calling. Goodbye!',
        fallbackSpeak: 'I apologize, could you please repeat that?'
    },
    'hi-IN': {
        name: 'Hindi',
        whisperCode: 'hi',
        ttsVoice: 'alloy',
        greeting: 'नमस्ते! मैं आज आपकी कैसे मदद कर सकता हूँ?',
        silencePrompt: 'क्या आप अभी भी वहाँ हैं? मैं आपकी मदद करने के लिए तैयार हूँ।',
        farewell: 'कॉल करने के लिए धन्यवाद। अलविदा!',
        fallbackSpeak: 'क्षमा करें, क्या आप दोबारा बोल सकते हैं?'
    },
    'ta-IN': {
        name: 'Tamil',
        whisperCode: 'ta',
        ttsVoice: 'alloy',
        greeting: 'வணக்கம்! இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?',
        silencePrompt: 'நீங்கள் இன்னும் இருக்கிறீர்களா? உங்களுக்கு உதவ நான் தயாராக இருக்கிறேன்.',
        farewell: 'அழைத்ததற்கு நன்றி. பிரியாவிடை!',
        fallbackSpeak: 'மன்னிக்கவும், மீண்டும் சொல்ல முடியுமா?'
    },
    'te-IN': {
        name: 'Telugu',
        whisperCode: 'te',
        ttsVoice: 'alloy',
        greeting: 'నమస్కారం! ఈరోజు నేను మీకు ఎలా సహాయం చేయగలను?',
        silencePrompt: 'మీరు ఇంకా ఉన్నారా? మీకు సహాయం చేయడానికి నేను సిద్ధంగా ఉన్నాను.',
        farewell: 'కాల్ చేసినందుకు ధన్యవాదాలు. వీడ్కోలు!',
        fallbackSpeak: 'క్షమించండి, మీరు మళ్ళీ చెప్పగలరా?'
    },
    'bn-IN': {
        name: 'Bengali',
        whisperCode: 'bn',
        ttsVoice: 'alloy',
        greeting: 'নমস্কার! আজ আমি আপনাকে কিভাবে সাহায্য করতে পারি?',
        silencePrompt: 'আপনি কি এখনও আছেন? আমি আপনাকে সাহায্য করতে প্রস্তুত।',
        farewell: 'কল করার জন্য ধন্যবাদ। বিদায়!',
        fallbackSpeak: 'দুঃখিত, আপনি কি আবার বলতে পারবেন?'
    },
    'mr-IN': {
        name: 'Marathi',
        whisperCode: 'mr',
        ttsVoice: 'alloy',
        greeting: 'नमस्कार! आज मी तुम्हाला कशी मदत करू शकतो?',
        silencePrompt: 'तुम्ही अजून तिथे आहात का? मी तुम्हाला मदत करायला तयार आहे.',
        farewell: 'कॉल केल्याबद्दल धन्यवाद. निरोप!',
        fallbackSpeak: 'क्षमस्व, तुम्ही पुन्हा सांगू शकता का?'
    },
    'kn-IN': {
        name: 'Kannada',
        whisperCode: 'kn',
        ttsVoice: 'alloy',
        greeting: 'ನಮಸ್ಕಾರ! ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
        silencePrompt: 'ನೀವು ಇನ್ನೂ ಇದ್ದೀರಾ? ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ನಾನು ಸಿದ್ಧ.',
        farewell: 'ಕರೆ ಮಾಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ವಿದಾಯ!',
        fallbackSpeak: 'ಕ್ಷಮಿಸಿ, ನೀವು ಮತ್ತೆ ಹೇಳಬಹುದೇ?'
    },
    'gu-IN': {
        name: 'Gujarati',
        whisperCode: 'gu',
        ttsVoice: 'alloy',
        greeting: 'નમસ્તે! આજે હું તમને કેવી રીતે મદદ કરી શકું?',
        silencePrompt: 'તમે હજી ત્યાં છો? હું તમને મદદ કરવા તૈયાર છું.',
        farewell: 'કૉલ કરવા બદલ આભાર. આવજો!',
        fallbackSpeak: 'માફ કરશો, શું તમે ફરી કહી શકો?'
    },
    'ml-IN': {
        name: 'Malayalam',
        whisperCode: 'ml',
        ttsVoice: 'alloy',
        greeting: 'നമസ്കാരം! ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കാം?',
        silencePrompt: 'നിങ്ങൾ ഇപ്പോഴും ഉണ്ടോ? നിങ്ങളെ സഹായിക്കാൻ ഞാൻ ഇവിടെ ഉണ്ട്.',
        farewell: 'വിളിച്ചതിന് നന്ദി. വിട!',
        fallbackSpeak: 'ക്ഷമിക്കണം, നിങ്ങൾക്ക് വീണ്ടും പറയാമോ?'
    }
};

/**
 * Get language config by locale code. Falls back to en-IN.
 * @param {string} locale - Locale code like 'hi-IN'
 * @returns {Object} Language config object
 */
function getLanguage(locale) {
    return LANGUAGES[locale] || LANGUAGES['en-IN'];
}

/**
 * Check if a locale is supported
 * @param {string} locale
 * @returns {boolean}
 */
function isSupported(locale) {
    return !!LANGUAGES[locale];
}

/**
 * Get list of all supported locale codes
 * @returns {string[]}
 */
function getSupportedLocales() {
    return Object.keys(LANGUAGES);
}

module.exports = { LANGUAGES, getLanguage, isSupported, getSupportedLocales };
