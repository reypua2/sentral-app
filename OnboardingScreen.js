import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Animated, KeyboardAvoidingView, Platform, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Import these from your existing App.js CONFIG and backendFetch
// Make sure to pass them as props or import directly
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:         '#0A0C10',
  bgCard:     '#111318',
  bgCardAlt:  '#161A22',
  border:     '#1E2330',
  accent:     '#3B82F6',
  accentSoft: '#1E2D45',
  light:      '#4ADE80',
  lightBg:    '#081410',
  normal:     '#F5C842',
  text:       '#F0F2F5',
  textSub:    '#8B95A8',
  textDim:    '#4A5568',
  muted:      '#6B7280',
  critical:   '#FF3B3B',
};

const CONTEXT_COLORS = {
  'Family':     '#4ADE80',
  'Church':     '#F5C842',
  'Mayor':      '#FF3B3B',
  'MCPro':      '#3B82F6',
  'Hardware':   '#FF8C00',
  'Foundation': '#A78BFA',
  'Printing':   '#06B6D4',
};

const VAD_CONFIG = {
  POLL_INTERVAL_MS:  150,
  SILENCE_THRESHOLD: -40,
  SILENCE_DURATION:  1500,
  MIN_RECORD_MS:     600,
};

// ─── ONBOARDING STEPS ────────────────────────────────────────────────────────
//
// Each step has:
//   id          — unique identifier
//   ariaText    — what Aria says (shown as chat bubble)
//   ariaSpeak   — what Aria speaks aloud (can differ for brevity)
//   placeholder — hint text in the input box
//   examples    — optional list of example answers shown above input
//   field       — which field this step captures (name, roles, firstItem)
//   isLast      — marks the final step
//
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    ariaText: `Hello! I am Aria, your personal AI assistant inside Sentralis.\n\nI will help you manage every part of your life — your tasks, schedule, money, and the people around you — all in one place.\n\nYou can talk to me by typing or by tapping the mic and speaking. I understand English, Filipino, and Bisaya.\n\nTo get started, what is your name?`,
    ariaSpeak: `Hello! I am Aria, your personal assistant inside Sentralis. You can type or speak to me. I understand English, Filipino, and Bisaya. What is your name?`,
    placeholder: 'Type your name here...',
    examples: [],
    field: 'name',
  },
  {
    id: 'roles',
    ariaText: ``, // filled dynamically with user's name
    ariaSpeak: ``,
    placeholder: 'Describe your work, roles, or responsibilities...',
    examples: [
      'I am a mayor and I run a hardware store',
      'I am a doctor and a father of 3',
      'I own a bakery and manage a small team',
      'I am a teacher and a church leader',
    ],
    field: 'roles',
  },
  {
    id: 'contexts',
    ariaText: ``,  // filled dynamically after AI processes roles
    ariaSpeak: ``,
    placeholder: null, // no input — user confirms contexts
    examples: [],
    field: 'contexts',
    isContextStep: true,
  },
  {
    id: 'firstItem',
    ariaText: `Good. Now let me show you how Sentralis works.\n\nWhat is one thing you need to do, remember, or track right now?\n\nHere are examples of what I can capture:`,
    ariaSpeak: `What is one thing you need to do, remember, or track right now? For example a task, an event, an expense, or a reminder.`,
    placeholder: 'Type or speak anything on your mind...',
    examples: [
      '📋 Follow up with my supplier tomorrow',
      '📅 Board meeting this Friday at 2PM, City Hall',
      '💰 Collect payment from Juan — ₱15,000',
      '📝 Buy groceries on the way home',
    ],
    field: 'firstItem',
  },
  {
    id: 'done',
    ariaText: ``,  // filled dynamically after first item is logged
    ariaSpeak: ``,
    placeholder: null,
    examples: [],
    field: null,
    isLast: true,
  },
];

// ─── ARIA BUBBLE ──────────────────────────────────────────────────────────────
function AriaBubble({ text, isTyping }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [text]);

  return (
    <Animated.View style={{
      opacity: fadeAnim,
      transform: [{ translateY: slideAnim }],
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 16,
    }}>
      {/* Aria Avatar */}
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: C.accentSoft,
        borderWidth: 1, borderColor: C.accent + '66',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 2,
      }}>
        <Text style={{ fontSize: 16 }}>◈</Text>
      </View>

      {/* Bubble */}
      <View style={{
        flex: 1,
        backgroundColor: C.bgCard,
        borderRadius: 16, borderTopLeftRadius: 4,
        borderWidth: 1, borderColor: C.border,
        padding: 14,
      }}>
        {isTyping ? (
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 4 }}>
            {[0, 1, 2].map(i => (
              <TypingDot key={i} delay={i * 180} />
            ))}
          </View>
        ) : (
          <Text style={{
            fontSize: 14, color: C.text,
            lineHeight: 22, letterSpacing: 0.1,
          }}>{text}</Text>
        )}
      </View>
    </Animated.View>
  );
}

function TypingDot({ delay }) {
  const anim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={{
      width: 7, height: 7, borderRadius: 4,
      backgroundColor: C.accent, opacity: anim,
    }} />
  );
}

// ─── USER BUBBLE ──────────────────────────────────────────────────────────────
function UserBubble({ text }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={{
      opacity: fadeAnim,
      alignItems: 'flex-end',
      marginBottom: 16,
    }}>
      <View style={{
        maxWidth: '80%',
        backgroundColor: C.accentSoft,
        borderRadius: 16, borderTopRightRadius: 4,
        borderWidth: 1, borderColor: C.accent + '55',
        padding: 12,
      }}>
        <Text style={{ fontSize: 14, color: C.text, lineHeight: 20 }}>{text}</Text>
      </View>
    </Animated.View>
  );
}

// ─── CONTEXT CHIPS ────────────────────────────────────────────────────────────
function ContextChips({ contexts, onConfirm }) {
  const [selected, setSelected] = useState(contexts);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const ALL_CONTEXTS = ['Family', 'Church', 'Mayor', 'MCPro', 'Hardware', 'Foundation', 'Printing'];

  const toggle = (ctx) => {
    setSelected(prev =>
      prev.includes(ctx) ? prev.filter(c => c !== ctx) : [...prev, ctx]
    );
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, marginBottom: 16 }}>
      <View style={{
        backgroundColor: C.bgCard, borderRadius: 16,
        borderWidth: 1, borderColor: C.border, padding: 16,
      }}>
        <Text style={{
          fontSize: 10, fontWeight: '700', color: C.textDim,
          letterSpacing: 1.5, marginBottom: 12,
        }}>TAP TO ADD OR REMOVE</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {ALL_CONTEXTS.map(ctx => {
            const color = CONTEXT_COLORS[ctx] || C.accent;
            const active = selected.includes(ctx);
            return (
              <TouchableOpacity key={ctx} onPress={() => toggle(ctx)} style={{
                paddingHorizontal: 14, paddingVertical: 8,
                borderRadius: 20, borderWidth: 1,
                borderColor: active ? color : C.border,
                backgroundColor: active ? color + '22' : C.bgCardAlt,
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: '700',
                  color: active ? color : C.textDim,
                }}>{ctx}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={() => onConfirm(selected)} style={{
          backgroundColor: C.light, borderRadius: 12,
          paddingVertical: 13, alignItems: 'center',
        }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#000' }}>
            ✓ These are my contexts
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── DONE CARD ────────────────────────────────────────────────────────────────
function DoneCard({ name, onEnter }) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{
      opacity: fadeAnim,
      transform: [{ scale: scaleAnim }],
      backgroundColor: C.lightBg,
      borderRadius: 20, borderWidth: 1,
      borderColor: C.light + '55',
      padding: 24, alignItems: 'center', gap: 12,
      marginBottom: 16,
    }}>
      <Text style={{ fontSize: 40 }}>✅</Text>
      <Text style={{
        fontSize: 20, fontWeight: '800', color: C.light,
        textAlign: 'center', letterSpacing: -0.5,
      }}>You are all set, {name}!</Text>
      <Text style={{
        fontSize: 13, color: C.textSub,
        textAlign: 'center', lineHeight: 20,
      }}>
        Sentralis is ready. Everything you tell me — I will capture, organize, and remind you of.
      </Text>
      <TouchableOpacity onPress={onEnter} style={{
        backgroundColor: C.light, borderRadius: 14,
        paddingVertical: 15, paddingHorizontal: 40,
        alignItems: 'center', marginTop: 8,
      }}>
        <Text style={{ fontSize: 15, fontWeight: '900', color: '#000', letterSpacing: 0.5 }}>
          Enter Sentralis →
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── MAIN ONBOARDING SCREEN ───────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete, backendFetch }) {
  const [messages, setMessages]       = useState([]);   // { type: 'aria'|'user', text, id }
  const [stepIndex, setStepIndex]     = useState(0);
  const [inputText, setInputText]     = useState('');
  const [isAriaTyping, setIsAriaTyping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showContexts, setShowContexts] = useState(false);
  const [detectedContexts, setDetectedContexts] = useState([]);
  const [showDone, setShowDone]       = useState(false);
  const [userName, setUserName]       = useState('');
  const [inputMode, setInputMode]     = useState('text'); // 'text' | 'voice'

  // Voice recording refs
  const [isRecording, setIsRecording]   = useState(false);
  const [silenceCount, setSilenceCount] = useState(0);
  const recordingRef      = useRef(null);
  const vadIntervalRef    = useRef(null);
  const recordingStartRef = useRef(null);
  const silenceSinceRef   = useRef(null);

  const scrollRef   = useRef(null);
  const inputRef    = useRef(null);
  const msgIdRef    = useRef(0);

  const nextId = () => { msgIdRef.current += 1; return msgIdRef.current; };

  // ── Show Aria message with typing delay ──────────────────────────────────
  const showAriaMessage = useCallback(async (text, speak = true) => {
    setIsAriaTyping(true);
    await new Promise(r => setTimeout(r, 900));
    setIsAriaTyping(false);
    setMessages(prev => [...prev, { type: 'aria', text, id: nextId() }]);
    if (speak) {
      Speech.stop();
      Speech.speak(text, { language: 'en-PH', pitch: 1.0, rate: 1.05 });
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  // ── Show user message bubble ─────────────────────────────────────────────
  const showUserMessage = (text) => {
    setMessages(prev => [...prev, { type: 'user', text, id: nextId() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ── Initial welcome message ──────────────────────────────────────────────
  useEffect(() => {
    const step = ONBOARDING_STEPS[0];
    setTimeout(async () => {
      await showAriaMessage(step.ariaText, true);
    }, 600);
  }, []);

  // ── Handle user submitting an answer ────────────────────────────────────
  const handleSubmit = async (text) => {
    const trimmed = (text || inputText).trim();
    if (!trimmed || isProcessing) return;
    setInputText('');
    showUserMessage(trimmed);
    setIsProcessing(true);

    const step = ONBOARDING_STEPS[stepIndex];

    try {
      // ── Step 0: Got name ───────────────────────────────────────────────
      if (step.field === 'name') {
        const words = trimmed.replace(/^(hi|hello|im|i'm|i am|name is|my name is)\s+/i, '').trim().split(' ');
const name = words[words.length - 1]; // first word
        setUserName(name);
        await AsyncStorage.setItem('user_name', name);

        const nextStep = ONBOARDING_STEPS[1];
        const rolesMsg = `Nice to meet you, ${name}!\n\nTo set up Sentralis correctly for you, tell me about your life — your job, your roles, your responsibilities.\n\nFor example:\n• "I am a mayor and I run a hardware store"\n• "I am a doctor and a father of 3"\n• "I own a bakery and lead a small team"\n\nDescribe yourself in your own words.`;
        const rolesSpeakMsg = `Nice to meet you, ${name}! Tell me about your life — your job, your roles, and your responsibilities.`;

        setStepIndex(1);
        await showAriaMessage(rolesMsg, true);
        Speech.speak(rolesSpeakMsg, { language: 'en-PH', rate: 1.05 });
      }

      // ── Step 1: Got roles — detect contexts via Claude ─────────────────
      else if (step.field === 'roles') {
        await showAriaMessage('Let me analyze your roles and set up your life contexts...', false);

        // Call backend to detect contexts from roles description
        let contexts = ['Family', 'MCPro']; // safe defaults
        try {
          const res = await backendFetch('/api/onboarding/detect-contexts', {
            method: 'POST',
            body: JSON.stringify({ roles: trimmed, userName }),
          });
          const data = await res.json();
          if (data.success && data.contexts?.length > 0) {
            contexts = data.contexts;
          }
        } catch (e) {
          // Fallback: parse keywords manually
          const lower = trimmed.toLowerCase();
          if (lower.includes('mayor') || lower.includes('government')) contexts.push('Mayor');
          if (lower.includes('church') || lower.includes('bishop') || lower.includes('pastor')) contexts.push('Church');
          if (lower.includes('hardware') || lower.includes('construction')) contexts.push('Hardware');
          if (lower.includes('foundation') || lower.includes('charity')) contexts.push('Foundation');
          if (lower.includes('print')) contexts.push('Printing');
          contexts = [...new Set(contexts)];
        }

        setDetectedContexts(contexts);

        const contextNames = contexts.join(', ');
        const contextMsg = `Based on what you told me, I have set up these life contexts for you:\n\n${contexts.map(c => `• ${c}`).join('\n')}\n\nThese are the categories I will use to organize everything — your tasks, events, expenses, and contacts.\n\nYou can add or remove any context below.`;

        setStepIndex(2);
        await showAriaMessage(contextMsg, true);
        setShowContexts(true);
      }

      // ── Step 3: Got first item — log it via voice pipeline ────────────
      else if (step.field === 'firstItem') {
        await showAriaMessage('I am saving that for you now...', false);

        let confirmMsg = `Saved. That is how easy it is.\n\nYou are now ready to use Sentralis. Every task, event, expense, or reminder — just tell me and I will take care of the rest.\n\nWelcome, ${userName}.`;

        try {
          const res = await backendFetch('/api/onboarding/log-first-item', {
            method: 'POST',
            body: JSON.stringify({ text: trimmed, userName }),
          });
          const data = await res.json();
          if (data.success && data.confirmationText) {
            confirmMsg = `${data.confirmationText}\n\nThat is how easy it is.\n\nYou are now ready to use Sentralis. Every task, event, expense, or reminder — just tell me and I will take care of the rest.\n\nWelcome, ${userName}.`;
          }
        } catch (e) {
          // Use default confirmation
        }

        setStepIndex(4);
        await showAriaMessage(confirmMsg, true);

        await AsyncStorage.setItem('onboarding_complete', 'true');
        await AsyncStorage.setItem('user_contexts', JSON.stringify(detectedContexts));

        setTimeout(() => setShowDone(true), 800);
      }

    } catch (e) {
      console.error('[ONBOARDING] handleSubmit error:', e.message);
      await showAriaMessage('Sorry, something went wrong. Please try again.', false);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Context confirmed by user ──────────────────────────────────────────
  const handleContextsConfirmed = async (selectedContexts) => {
    setShowContexts(false);
    setDetectedContexts(selectedContexts);
    await AsyncStorage.setItem('user_contexts', JSON.stringify(selectedContexts));

    const confirmed = selectedContexts.join(', ');
    showUserMessage(`My contexts: ${confirmed}`);

    const firstItemMsg = `Your contexts are saved: ${confirmed}.\n\nNow let me show you how Sentralis works.\n\nWhat is one thing you need to do, remember, or track right now?\n\nHere are examples of what I can capture:\n\n📋 Follow up with my supplier tomorrow\n📅 Board meeting this Friday at 2PM, City Hall\n💰 Collect payment from Juan — ₱15,000\n📝 Buy groceries on the way home\n\nType or speak it naturally — I will figure out the rest.`;

    setStepIndex(3);
    await showAriaMessage(firstItemMsg, true);
  };

  // ── Voice recording ───────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      Speech.stop();
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); } catch (e) {}
        recordingRef.current = null;
      }
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;
      recordingStartRef.current = Date.now();
      silenceSinceRef.current = null;
      setIsRecording(true);
      setSilenceCount(0);

      vadIntervalRef.current = setInterval(async () => {
        if (!recordingRef.current) return;
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (!status.isRecording) return;
          const db = status.metering ?? -160;
          const now = Date.now();
          const elapsed = now - (recordingStartRef.current || now);
          if (elapsed < VAD_CONFIG.MIN_RECORD_MS) return;
          if (db < VAD_CONFIG.SILENCE_THRESHOLD) {
            if (!silenceSinceRef.current) silenceSinceRef.current = now;
            const silenceMs = now - silenceSinceRef.current;
            setSilenceCount(Math.min(1, silenceMs / VAD_CONFIG.SILENCE_DURATION));
            if (silenceMs >= VAD_CONFIG.SILENCE_DURATION) {
              clearInterval(vadIntervalRef.current);
              vadIntervalRef.current = null;
              await stopAndTranscribe();
            }
          } else {
            silenceSinceRef.current = null;
            setSilenceCount(0);
          }
        } catch (e) {}
      }, VAD_CONFIG.POLL_INTERVAL_MS);

    } catch (e) {
      console.error('[ONBOARDING] startRecording error:', e.message);
      setIsRecording(false);
    }
  };

  const stopAndTranscribe = async () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    if (!recordingRef.current) { setIsRecording(false); return; }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setSilenceCount(0);

      setIsProcessing(true);
      const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const res = await backendFetch('/api/onboarding/transcribe', {
        method: 'POST',
        body: JSON.stringify({ audio_base64: base64Audio, format: 'm4a' }),
      });
      const data = await res.json();
      if (data.transcription?.trim()) {
        setIsProcessing(false);
        await handleSubmit(data.transcription.trim());
      } else {
        setIsProcessing(false);
      }
    } catch (e) {
      console.error('[ONBOARDING] stopAndTranscribe error:', e.message);
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleMicPress = async () => {
    if (isRecording) {
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }
      await stopAndTranscribe();
    } else {
      await startRecording();
    }
  };

  // ── Current step for placeholder ──────────────────────────────────────
  const currentStep = ONBOARDING_STEPS[stepIndex] || ONBOARDING_STEPS[0];
  const showInput = !showContexts && !showDone && stepIndex !== 2;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: C.border,
        }}>
          <View style={{
            width: 32, height: 32, borderRadius: 16,
            backgroundColor: C.accentSoft, borderWidth: 1,
            borderColor: C.accent + '66', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 14, color: C.accent }}>◈</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: 0.3 }}>
              ARIA
            </Text>
            <Text style={{ fontSize: 10, color: C.light, letterSpacing: 0.5 }}>
              ● Setting up your Sentralis
            </Text>
          </View>
          {/* Progress dots */}
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={{
                width: i <= stepIndex ? 16 : 6,
                height: 6, borderRadius: 3,
                backgroundColor: i <= stepIndex ? C.accent : C.border,
              }} />
            ))}
          </View>
        </View>

        {/* ── Chat messages ── */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map(msg => (
            msg.type === 'aria'
              ? <AriaBubble key={msg.id} text={msg.text} />
              : <UserBubble key={msg.id} text={msg.text} />
          ))}

          {/* Aria typing indicator */}
          {isAriaTyping && <AriaBubble text="" isTyping />}

          {/* Context chips */}
          {showContexts && (
            <ContextChips
              contexts={detectedContexts}
              onConfirm={handleContextsConfirmed}
            />
          )}

          {/* Done card */}
          {showDone && (
            <DoneCard
              name={userName}
              onEnter={() => onComplete({ userName, contexts: detectedContexts })}
            />
          )}

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* ── Input bar — always visible, Gemini style ── */}
        {showInput && (
          <View style={{
            borderTopWidth: 1, borderTopColor: C.border,
            backgroundColor: C.bgCard,
            paddingHorizontal: 16, paddingVertical: 10,
            paddingBottom: Platform.OS === 'ios' ? 24 : 34,
          }}>
            {/* Silence progress bar — shown while recording */}
            {isRecording && silenceCount > 0 && (
              <View style={{
                height: 2, backgroundColor: C.border,
                borderRadius: 1, marginBottom: 8, overflow: 'hidden',
              }}>
                <View style={{
                  height: 2, borderRadius: 1,
                  backgroundColor: C.normal,
                  width: `${Math.round(silenceCount * 100)}%`,
                }} />
              </View>
            )}

            <View style={{
              flexDirection: 'row', alignItems: 'flex-end', gap: 8,
            }}>
              {/* Text input */}
              <View style={{
                flex: 1,
                backgroundColor: C.bgCardAlt,
                borderRadius: 24, borderWidth: 1,
                borderColor: isRecording ? C.normal + '88' : C.border,
                paddingHorizontal: 16, paddingVertical: 10,
                minHeight: 44, justifyContent: 'center',
              }}>
                {isRecording ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.critical }} />
                    <Text style={{ fontSize: 13, color: C.normal }}>
                      Listening — speak now...
                    </Text>
                  </View>
                ) : isProcessing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={{ fontSize: 13, color: C.textDim }}>Processing...</Text>
                  </View>
                ) : (
                  <TextInput
                    ref={inputRef}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={currentStep.placeholder || 'Type your answer...'}
                    placeholderTextColor={C.textDim}
                    multiline
                    style={{
                      fontSize: 14, color: C.text,
                      maxHeight: 100, padding: 0,
                    }}
                    onSubmitEditing={() => handleSubmit()}
                    blurOnSubmit={false}
                    editable={!isProcessing && !isRecording}
                  />
                )}
              </View>

              {/* Mic button */}
              <TouchableOpacity
                onPress={handleMicPress}
                disabled={isProcessing}
                style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: isRecording ? C.critical : C.accentSoft,
                  borderWidth: 1,
                  borderColor: isRecording ? C.critical : C.accent + '66',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 18 }}>
                  {isRecording ? '⏹' : '🎤'}
                </Text>
              </TouchableOpacity>

              {/* Send button — only shown when text is typed */}
              {inputText.trim().length > 0 && !isRecording && (
                <TouchableOpacity
                  onPress={() => handleSubmit()}
                  disabled={isProcessing}
                  style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: C.accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 18, color: '#fff' }}>↑</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
