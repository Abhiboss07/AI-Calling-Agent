/**
 * Finite State Machine for Real Estate AI Calling Agent
 * Handles conversation flow with proper state transitions
 */

const logger = require('../utils/logger');

// Conversation States
const States = {
  INIT: 'INIT',
  INTRODUCING: 'INTRODUCING',
  WAITING_CONFIRMATION: 'WAITING_CONFIRMATION',
  QUALIFYING_LEAD: 'QUALIFYING_LEAD',
  HANDLING_OBJECTION: 'HANDLING_OBJECTION',
  BOOKING_SITE_VISIT: 'BOOKING_SITE_VISIT',
  CLOSING: 'CLOSING',
  END_CALL: 'END_CALL',
  LISTENING: 'LISTENING',
  PROCESSING: 'PROCESSING',
  SPEAKING: 'SPEAKING'
};

// State transitions based on intent
const Transitions = {
  [States.INIT]: {
    onEnter: 'playIntro',
    transitions: {
      call_answered: States.INTRODUCING
    }
  },
  [States.INTRODUCING]: {
    onEnter: null,
    transitions: {
      user_interrupted: States.LISTENING,
      intro_complete: States.WAITING_CONFIRMATION
    }
  },
  [States.WAITING_CONFIRMATION]: {
    onEnter: null,
    transitions: {
      yes: States.QUALIFYING_LEAD,
      no: States.CLOSING,
      not_interested: States.CLOSING,
      confused: States.INTRODUCING,
      callback_request: States.BOOKING_SITE_VISIT,
      user_speaking: States.LISTENING
    }
  },
  [States.QUALIFYING_LEAD]: {
    onEnter: null,
    transitions: {
      price_inquiry: States.QUALIFYING_LEAD,
      site_visit_request: States.BOOKING_SITE_VISIT,
      location_inquiry: States.QUALIFYING_LEAD,
      budget_inquiry: States.QUALIFYING_LEAD,
      objection: States.HANDLING_OBJECTION,
      not_interested: States.CLOSING,
      user_speaking: States.LISTENING
    }
  },
  [States.HANDLING_OBJECTION]: {
    onEnter: null,
    transitions: {
      objection_resolved: States.QUALIFYING_LEAD,
      persistent_objection: States.CLOSING,
      user_speaking: States.LISTENING
    }
  },
  [States.BOOKING_SITE_VISIT]: {
    onEnter: null,
    transitions: {
      booking_confirmed: States.CLOSING,
      booking_declined: States.QUALIFYING_LEAD,
      user_speaking: States.LISTENING
    }
  },
  [States.CLOSING]: {
    onEnter: 'playFarewell',
    transitions: {
      close_complete: States.END_CALL
    }
  },
  [States.END_CALL]: {
    onEnter: 'hangup',
    transitions: {}
  },
  [States.LISTENING]: {
    onEnter: null,
    transitions: {
      speech_detected: States.PROCESSING,
      silence_timeout: States.CLOSING
    }
  },
  [States.PROCESSING]: {
    onEnter: 'processIntent',
    transitions: {
      intent_classified: States.SPEAKING,
      processing_error: States.LISTENING
    }
  },
  [States.SPEAKING]: {
    onEnter: 'playResponse',
    transitions: {
      user_interrupted: States.LISTENING,
      speech_complete: States.WAITING_CONFIRMATION
    }
  }
};

class ConversationFSM {
  constructor(sessionId, direction = 'inbound', language = 'en-IN', config = {}) {
    this.sessionId = sessionId;
    this.direction = direction;
    this.language = language;
    this.config = config;
    
    this.state = States.INIT;
    this.previousState = null;
    this.stateHistory = [];
    
    this.leadData = {
      name: null,
      phone: null,
      intent: null,
      propertyType: null,
      budget: null,
      location: null,
      timeline: null,
      siteVisitDate: null,
      objections: [],
      availabilityConfirmed: false
    };
    
    this.turnCount = 0;
    this.lastIntent = null;
    this.silenceCount = 0;
    this.interruptCount = 0;
    
    // Intent detection confidence
    this.intentConfidence = 0;
    
    // Conversation context for LLM
    this.context = {
      topic: null,
      lastQuestion: null,
      pendingAnswer: null
    };
    
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    
    // Pre-generated responses cache
    this.responseCache = new Map();
  }

  getState() {
    return this.state;
  }

  getPreviousState() {
    return this.previousState;
  }

  canTransition(event) {
    const currentTransitions = Transitions[this.state]?.transitions;
    return currentTransitions && event in currentTransitions;
  }

  transition(event, data = {}) {
    if (!this.canTransition(event)) {
      logger.debug(`Invalid transition: ${this.state} -> ${event}`);
      return { success: false, state: this.state, error: 'Invalid transition' };
    }

    const newState = Transitions[this.state].transitions[event];
    this.previousState = this.state;
    this.state = newState;
    
    this.stateHistory.push({
      from: this.previousState,
      to: newState,
      event,
      timestamp: Date.now(),
      data
    });
    
    this.lastActivity = Date.now();
    this.turnCount++;
    
    // Update lead data if provided
    if (data.leadData) {
      Object.assign(this.leadData, data.leadData);
    }
    
    logger.debug(`FSM Transition: ${this.previousState} --${event}--> ${newState}`, {
      sessionId: this.sessionId,
      turnCount: this.turnCount
    });
    
    // Execute onEnter action if defined
    const onEnter = Transitions[newState]?.onEnter;
    
    return { 
      success: true, 
      state: newState, 
      previousState: this.previousState,
      action: onEnter,
      data
    };
  }

  // Intent Classification
  classifyIntent(transcript) {
    const text = String(transcript || '').toLowerCase().trim();
    if (!text) return { intent: 'silence', confidence: 0 };
    
    // Availability check responses
    if (this.state === States.WAITING_CONFIRMATION || this.state === States.INTRODUCING) {
      if (/\b(yes|haan|haan ji|sure|ok|okay|go ahead|boliye|bolo|theek hai|thik hai|baat karo)\b/i.test(text)) {
        return { intent: 'yes', confidence: 0.9, leadData: { availabilityConfirmed: true } };
      }
      if (/\b(no|not now|busy|later|call later|abhi nahi|नहीं|baad me|kaam hai)\b/i.test(text)) {
        return { intent: 'no', confidence: 0.9 };
      }
      if (/\b(not interested|no thanks|pass|not looking|aise hi|time waste)\b/i.test(text)) {
        return { intent: 'not_interested', confidence: 0.85 };
      }
      if (/\b(confused|what|kaun|kaise|samajh nahi|kya bol rahe)\b/i.test(text)) {
        return { intent: 'confused', confidence: 0.7 };
      }
    }
    
    // Qualification intents
    const intents = {
      price_inquiry: /\b(price|cost|rate|kitna|price kya|kimat|budget kitna|how much)\b/i,
      site_visit_request: /\b(visit|dikhao|dekhna|site|location dekhna|ghar dekhna|property dekhna|book visit|schedule visit)\b/i,
      location_inquiry: /\b(location|area|address|kahan|kidhar|sector|nearby|close to)\b/i,
      budget_inquiry: /\b(budget|range|afford|kitna kharch|investment amount|price range)\b/i,
      buy_intent: /\b(buy|purchase|kharidna|kharid|खरीदना|own home|apna ghar)\b/i,
      rent_intent: /\b(rent|rental|lease|kiraya|kiraye|किराए|rent pe)\b/i,
      invest_intent: /\b(invest|investment|returns|roi|business|पैसे लगाना)\b/i,
      callback_request: /\b(callback|call back|baad me|dobara|later|evening|morning|tomorrow)\b/i,
      objection: /\b(expensive|costly|mahanga|budget nahi|too high|overpriced|soch ke|think about it|compare|dekhte hain)\b/i,
      not_interested: /\b(not interested|pass|no need|nahi chahiye|aise hi|wrong number|do not call|dnc)\b/i,
      confused: /\b(confused|samajh nahi|kya|what|repeat|fir se|dubara)\b/i,
      end_call: /\b(bye|goodbye|thanks|thank you|dhanyavaad|dhanyaawad|bas| enough|hang up|disconnect)\b/i
    };
    
    for (const [intent, pattern] of Object.entries(intents)) {
      if (pattern.test(text)) {
        const leadData = {};
        if (intent === 'buy_intent') leadData.intent = 'buy';
        if (intent === 'rent_intent') leadData.intent = 'rent';
        if (intent === 'invest_intent') leadData.intent = 'invest';
        
        return { intent, confidence: 0.8, leadData };
      }
    }
    
    // Default to qualifying if we're in qualification state
    if (this.state === States.QUALIFYING_LEAD) {
      return { intent: 'continue_qualification', confidence: 0.6 };
    }
    
    return { intent: 'unknown', confidence: 0.3 };
  }

  // Process transcript and determine next action
  processTranscript(transcript) {
    const classification = this.classifyIntent(transcript);
    this.lastIntent = classification.intent;
    this.intentConfidence = classification.confidence;
    
    // Map intent to event
    const intentToEvent = {
      'yes': 'yes',
      'no': 'no',
      'not_interested': 'not_interested',
      'confused': 'confused',
      'callback_request': 'callback_request',
      'price_inquiry': 'price_inquiry',
      'site_visit_request': 'site_visit_request',
      'location_inquiry': 'location_inquiry',
      'budget_inquiry': 'budget_inquiry',
      'buy_intent': 'price_inquiry',
      'rent_intent': 'location_inquiry',
      'invest_intent': 'budget_inquiry',
      'objection': 'objection',
      'end_call': 'not_interested',
      'silence': 'user_speaking',
      'unknown': 'user_speaking',
      'continue_qualification': 'user_speaking'
    };
    
    const event = intentToEvent[classification.intent] || 'user_speaking';
    
    // Try to transition
    if (this.canTransition(event)) {
      return this.transition(event, { 
        leadData: classification.leadData,
        transcript,
        intent: classification.intent,
        confidence: classification.confidence
      });
    }
    
    // If can't transition, stay in current state
    return { 
      success: false, 
      state: this.state, 
      error: 'No valid transition for intent',
      intent: classification.intent,
      data: classification
    };
  }

  // Handle interruption
  handleInterrupt() {
    this.interruptCount++;
    
    if (this.state === States.SPEAKING || this.state === States.INTRODUCING) {
      return this.transition('user_interrupted', { interruptCount: this.interruptCount });
    }
    
    return { success: false, state: this.state };
  }

  // Handle silence timeout
  handleSilence() {
    this.silenceCount++;
    
    if (this.silenceCount >= 2 && this.state !== States.CLOSING && this.state !== States.END_CALL) {
      return this.transition('silence_timeout', { silenceCount: this.silenceCount });
    }
    
    return { success: false, state: this.state, silenceCount: this.silenceCount };
  }

  // Get conversation summary for LLM context
  getLLMContext() {
    const recentHistory = this.stateHistory.slice(-5);
    
    return {
      currentState: this.state,
      previousState: this.previousState,
      turnCount: this.turnCount,
      direction: this.direction,
      language: this.language,
      leadData: this.leadData,
      lastIntent: this.lastIntent,
      stateHistory: recentHistory,
      context: this.context
    };
  }

  // Get recommended response based on state
  getRecommendedResponse() {
    const responses = {
      [States.INTRODUCING]: this.getIntroText(),
      [States.WAITING_CONFIRMATION]: null, // Wait for user
      [States.QUALIFYING_LEAD]: this.getQualifyingQuestion(),
      [States.HANDLING_OBJECTION]: this.getObjectionResponse(),
      [States.BOOKING_SITE_VISIT]: this.getBookingPrompt(),
      [States.CLOSING]: this.getClosingText(),
      [States.LISTENING]: null, // Wait for speech
      [States.PROCESSING]: null, // Processing
      [States.SPEAKING]: null // Speaking
    };
    
    return responses[this.state];
  }

  getIntroText() {
    const company = this.config.companyName || 'our company';
    const agent = this.config.agentName || 'the assistant';
    
    if (this.direction === 'outbound') {
      if (this.language === 'hi-IN') {
        return `नमस्ते, मैं ${company} से ${agent} बोल रही हूँ। क्या अभी बात करने का सही समय है?`;
      }
      if (this.language === 'hinglish') {
        return `Hello, main ${agent} ${company} se bol rahi hoon. Kya abhi baat karne ka sahi time hai?`;
      }
      return `Hello, this is ${agent} from ${company}. Is this a good time to talk?`;
    }
    
    // Inbound
    if (this.language === 'hi-IN') {
      return `नमस्ते, ${company} में कॉल करने के लिए धन्यवाद। मैं आपकी कैसे मदद कर सकती हूँ?`;
    }
    if (this.language === 'hinglish') {
      return `Hello, ${company} ko call karne ke liye thanks. Main aapki kaise help kar sakti hoon?`;
    }
    return `Hello, thank you for calling ${company}. How may I assist you today?`;
  }

  getQualifyingQuestion() {
    if (!this.leadData.intent) {
      if (this.language === 'hi-IN') {
        return `बहुत अच्छा। क्या आप खरीदना, किराए पर लेना, या निवेश करना चाहते हैं?`;
      }
      if (this.language === 'hinglish') {
        return `Great. Aap buy, rent, ya invest ke liye dekh rahe hain?`;
      }
      return `Great. Are you looking to buy, rent, or invest?`;
    }
    
    if (!this.leadData.propertyType) {
      if (this.language === 'hi-IN') {
        return `किस तरह की प्रॉपर्टी पसंद करेंगे? अपार्टमेंट, विला, या प्लॉट?`;
      }
      if (this.language === 'hinglish') {
        return `Kaunsi property prefer karenge? Apartment, villa, ya plot?`;
      }
      return `What type of property are you considering? Apartment, villa, or plot?`;
    }
    
    if (!this.leadData.budget) {
      if (this.language === 'hi-IN') {
        return `क्या बजट रेंज बता सकते हैं?`;
      }
      if (this.language === 'hinglish') {
        return `Budget range kya hai aapka?`;
      }
      return `What is your budget range?`;
    }
    
    if (!this.leadData.location) {
      if (this.language === 'hi-IN') {
        return `किस लोकेशन में देख रहे हैं?`;
      }
      if (this.language === 'hinglish') {
        return `Kis location mein dekh rahe hain?`;
      }
      return `Which location are you looking at?`;
    }
    
    // Ready for site visit
    if (this.language === 'hi-IN') {
      return `शानदार। क्या मैं आपके लिए साइट विजिट शेड्यूल कर दूँ?`;
    }
    if (this.language === 'hinglish') {
      return `Bahut accha. Kya main aapke liye site visit schedule karoon?`;
    }
    return `Excellent. Shall I schedule a site visit for you?`;
  }

  getObjectionResponse() {
    if (this.language === 'hi-IN') {
      return `मैं समझती हूँ। हमारे पास हर बजट में विकल्प हैं। एक बार साइट देख लीजिए, कोई ज़बरदस्ती नहीं है।`;
    }
    if (this.language === 'hinglish') {
      return `Main samajhti hoon. Har budget mein options hain. Ek baar site dekh lijiye, koi zabardasti nahi.`;
    }
    return `I understand. We have options for every budget. Just visit once, no obligation.`;
  }

  getBookingPrompt() {
    if (this.language === 'hi-IN') {
      return `कौन सी तारीख और समय आपके लिए सही रहेगा?`;
    }
    if (this.language === 'hinglish') {
      return `Kaunsi date aur time convenient rahega?`;
    }
    return `Which date and time works best for you?`;
  }

  getClosingText() {
    if (this.leadData.siteVisitDate) {
      if (this.language === 'hi-IN') {
        return `धन्यवाद। हमारा टीम मेंबर जल्द ही कॉल करेगा। नमस्ते।`;
      }
      if (this.language === 'hinglish') {
        return `Thank you ji. Humara team member jald call karega. Goodbye.`;
      }
      return `Thank you. Our team member will call you shortly. Goodbye.`;
    }
    
    if (this.language === 'hi-IN') {
      return `धन्यवाद आपके समय के लिए। अच्छा दिन रहे।`;
    }
    if (this.language === 'hinglish') {
      return `Thank you ji aapke time ke liye. Accha din rahe.`;
    }
    return `Thank you for your time. Have a great day.`;
  }

  // Cache pre-generated response
  cacheResponse(key, audioBuffer) {
    this.responseCache.set(key, {
      buffer: audioBuffer,
      timestamp: Date.now()
    });
  }

  getCachedResponse(key) {
    const cached = this.responseCache.get(key);
    if (!cached) return null;
    
    // Cache expiry: 5 minutes
    if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
      this.responseCache.delete(key);
      return null;
    }
    
    return cached.buffer;
  }

  // Serialize for storage
  serialize() {
    return {
      sessionId: this.sessionId,
      state: this.state,
      previousState: this.previousState,
      direction: this.direction,
      language: this.language,
      leadData: this.leadData,
      turnCount: this.turnCount,
      stateHistory: this.stateHistory,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity
    };
  }
}

module.exports = { ConversationFSM, States, Transitions };
