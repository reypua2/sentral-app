import { StatusBar } from 'expo-status-bar';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  SafeAreaView,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  PanResponder,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import * as SQLite from 'expo-sqlite';

const { width } = Dimensions.get('window');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const CONFIG = {
  SHEET_ID: '1drG8HimSVPkvjcWy9_LpF2F2eLqe1FxE9ua3GdqEX0c',
  API_KEY: 'AIzaSyDyDNOuUXNzwVbhmeFqJQnPrWMVUlRbcMQ',
  BACKEND_URL: 'https://sentralis-backend-production.up.railway.app',
  USE_BACKEND: true,
};

// ─── COLOR SYSTEM ─────────────────────────────────────────────────────────────
const C = {
  bg:         '#0A0C10',
  bgCard:     '#111318',
  bgCardAlt:  '#161A22',
  border:     '#1E2330',
  critical:   '#FF3B3B',
  criticalBg: '#1A0A0A',
  important:  '#FF8C00',
  importantBg:'#1A1100',
  normal:     '#F5C842',
  normalBg:   '#181500',
  light:      '#4ADE80',
  lightBg:    '#081410',
  muted:      '#6B7280',
  mutedBg:    '#0F1015',
  accent:     '#3B82F6',
  accentSoft: '#1E2D45',
  text:       '#F0F2F5',
  textSub:    '#8B95A8',
  textDim:    '#4A5568',
  navBg:      '#0D1017',
  navBorder:  '#1A2035',
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

const PRIORITY_CONFIG = {
  critical:  { color: C.critical,  bg: C.criticalBg,  label: 'CRITICAL'  },
  important: { color: C.important, bg: C.importantBg, label: 'IMPORTANT' },
  normal:    { color: C.normal,    bg: C.normalBg,    label: 'NORMAL'    },
  light:     { color: C.light,     bg: C.lightBg,     label: 'LIGHT'     },
};

const NAV_TABS = [
  { id: 'command', label: 'Command', icon: '⊞' },
  { id: 'people',  label: 'People',  icon: '◎' },
  { id: 'time',    label: 'Time',    icon: '◷' },
  { id: 'money',   label: 'Money',   icon: '◈' },
  { id: 'tasks',   label: 'Tasks',   icon: '◻' },
  { id: 'more',    label: 'More',    icon: '···' },
];

// ─── SHEETS SERVICE ───────────────────────────────────────────────────────────
const SheetsService = {

  parseEvent: (row, headers) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return {
      id:           obj.event_id   || '',
      date:         obj.date       || '',
      time:         obj.time       || '',
      title:        obj.title      || '',
      context:      obj.context    || '',
      contextColor: CONTEXT_COLORS[obj.context] || C.accent,
      priority:     obj.priority   || 'normal',
      detail:       obj.detail     || '',
      location:     obj.location   || '',
      status:       obj.status     || 'active',
      conflict:     obj.conflict   === 'TRUE',
      needsApproval:obj.needs_approval === 'TRUE',
    };
  },

  parseTask: (row, headers) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return {
      id:          obj.task_id     || '',
      title:       obj.title       || '',
      context:     obj.context     || '',
      contextColor:CONTEXT_COLORS[obj.context] || C.accent,
      priority:    obj.priority    || 'normal',
      status:      obj.status      || 'pending',
      dueDate:     obj.due_date    || '',
      assignedTo:  obj.assigned_to || '',
      detail:      obj.detail      || '',
    };
  },

  getTodayString: () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  fetchSheet: async (range) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${range}?key=${CONFIG.API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Sheets API error: ${response.status}`);
    const data = await response.json();
    return data.values || [];
  },

  fetchTodayEvents: async () => {
    const rows = await SheetsService.fetchSheet('Events!A1:O100');
    if (rows.length < 2) return [];
    const headers = rows[0];
    const today = SheetsService.getTodayString();
    return rows.slice(1)
      .map(row => SheetsService.parseEvent(row, headers))
      .filter(e => e.date === today && e.status === 'active')
      .sort((a, b) => a.time.localeCompare(b.time));
  },

  fetchAllTasks: async () => {
    const rows = await SheetsService.fetchSheet('Tasks!A1:J100');
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1)
      .map(row => SheetsService.parseTask(row, headers))
      .filter(t => t.id !== '');
  },

  calculateStats: (events) => {
    const conflicts = events.filter(e => e.conflict).length;
    const pending   = events.filter(e => e.needsApproval).length;
    const done      = events.filter(e => e.status === 'done').length;
    return [
      { label: 'Events',    value: String(events.length), icon: '◈' },
      { label: 'Conflicts', value: String(conflicts),     icon: '⚠',  alert: conflicts > 0 },
      { label: 'Pending',   value: String(pending),       icon: '⏳' },
      { label: 'Done',      value: String(done),          icon: '✓',  good: done > 0 },
    ];
  },

  buildConflictDescription: (events) => {
    const conflicting = events.filter(e => e.conflict);
    if (conflicting.length < 2) return conflicting.length === 1 ? `${conflicting[0].time} ${conflicting[0].title} has a scheduling conflict` : null;
    return `${conflicting[0].time} ${conflicting[0].title} overlaps with ${conflicting[1].time} ${conflicting[1].title}`;
  },

  isOverdue: (dueDate) => { if (!dueDate) return false; return dueDate < SheetsService.getTodayString(); },
  isDueToday: (dueDate) => { if (!dueDate) return false; return dueDate === SheetsService.getTodayString(); },

  parsePerson: (row, headers) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return {
      id:          obj.person_id   || '',
      name:        obj.name        || '',
      nickname:    obj.nickname    || '',
      context:     obj.context     || '',
      contextColor:CONTEXT_COLORS[obj.context] || C.accent,
      role:        obj.role        || '',
      phone:       obj.phone       || '',
      email:       obj.email       || '',
      birthday:    obj.birthday    || '',
      address:     obj.address     || '',
      notes:       obj.notes       || '',
      priority:    obj.priority    || 'normal',
      lastContact: obj.last_contact|| '',
    };
  },

  fetchAllPeople: async () => {
    const rows = await SheetsService.fetchSheet('People!A1:M100');
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1)
      .map(row => SheetsService.parsePerson(row, headers))
      .filter(p => p.id !== '');
  },

  parseMoney: (row, headers) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return {
      id:          obj.money_id    || '',
      date:        obj.date        || '',
      type:        obj.type        || '',
      amount:      parseFloat(obj.amount) || 0,
      currency:    obj.currency    || 'PHP',
      context:     obj.context     || '',
      contextColor:CONTEXT_COLORS[obj.context] || C.accent,
      category:    obj.category    || '',
      description: obj.description || '',
      account:     obj.account     || '',
    };
  },

  fetchAllMoney: async () => {
    const rows = await SheetsService.fetchSheet('Money!A1:K100');
    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1)
      .map(row => SheetsService.parseMoney(row, headers))
      .filter(m => m.id !== '');
  },
};

// ─── OFFLINE QUEUE (SQLite) ───────────────────────────────────────────────────
//
// Saves voice logs locally first — syncs to backend when online.
// Logging works instantly with zero internet dependency.
//
const OfflineQueue = {
  db: null,

  init: async () => {
    try {
      OfflineQueue.db = await SQLite.openDatabaseAsync('sentralis_queue.db');
      await OfflineQueue.db.execAsync(`
        CREATE TABLE IF NOT EXISTS queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          context TEXT,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          synced INTEGER DEFAULT 0
        );
      `);
      // Clean up invalid items from old builds
      await OfflineQueue.db.runAsync("DELETE FROM queue WHERE type NOT IN ('task', 'event', 'money', 'note')");
      console.log('[QUEUE] SQLite ready');
    } catch (e) {
      console.error('[QUEUE] Init error:', e.message);
    }
  },

  save: async (type, context, data) => {
    try {
      if (!OfflineQueue.db) await OfflineQueue.init();
      const now = new Date().toISOString();
      await OfflineQueue.db.runAsync(
        'INSERT INTO queue (type, context, data, created_at, synced) VALUES (?, ?, ?, ?, 0)',
        [type, context, JSON.stringify(data), now]
      );
      console.log(`[QUEUE] Saved locally: ${type}`);
      return true;
    } catch (e) {
      console.error('[QUEUE] Save error:', e.message);
      return false;
    }
  },

  getPending: async () => {
    try {
      if (!OfflineQueue.db) await OfflineQueue.init();
      const rows = await OfflineQueue.db.getAllAsync(
        'SELECT * FROM queue WHERE synced = 0 ORDER BY created_at ASC'
      );
      return rows;
    } catch (e) {
      console.error('[QUEUE] getPending error:', e.message);
      return [];
    }
  },

  markSynced: async (id) => {
    try {
      if (!OfflineQueue.db) await OfflineQueue.init();
      await OfflineQueue.db.runAsync('UPDATE queue SET synced = 1 WHERE id = ?', [id]);
    } catch (e) {
      console.error('[QUEUE] markSynced error:', e.message);
    }
  },

  syncAll: async () => {
    const pending = await OfflineQueue.getPending();
    if (pending.length === 0) return;
    console.log(`[QUEUE] Syncing ${pending.length} pending item(s)...`);
    for (const item of pending) {
      try {
        const data = JSON.parse(item.data);
        let endpoint = '';
        let body = {};
        if (item.type === 'task') {
          endpoint = '/api/tasks';
          body = { title: data.title, context: item.context, priority: data.priority, dueDate: data.due_date, assignedTo: 'Rey', detail: data.description };
        } else if (item.type === 'event') {
          endpoint = '/api/events';
          body = { title: data.title, context: item.context, date: data.date, time: data.time, location: data.location, priority: data.priority };
        } else if (item.type === 'money') {
          endpoint = '/api/money';
          body = { type: data.type_money || 'expense', amount: data.amount, currency: 'PHP', context: item.context, category: data.category, description: data.description };
        } else if (item.type === 'note') {
          endpoint = '/api/notes';
          body = { title: data.title, context: item.context, content: data.description, priority: data.priority };
        }
        if (endpoint) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          try {
            const res = await fetch(`${CONFIG.BACKEND_URL}${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            const result = await res.json();
            if (result.success) {
              await OfflineQueue.markSynced(item.id);
              console.log(`[QUEUE] Synced item ${item.id} (${item.type})`);
            } else {
              console.log(`[QUEUE] Sync rejected (${item.type}): ${result.error}`);
            }
          } catch (fetchErr) {
            clearTimeout(timeout);
            console.log(`[QUEUE] Fetch failed for item ${item.id}: ${fetchErr.message}`);
          }
        }
      } catch (e) {
        console.log(`[QUEUE] Sync error item ${item.id}: ${e.message}`);
      }
    }
  },
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

// Formats any time string to clean display
// Handles: "09:00", "9:00", "010am", "10am", "6pm", "18:00", "0630am"
function formatTime(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toLowerCase();

  // HH:MM 24h format e.g. "09:00", "18:30"
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    let h = parseInt(hhmm[1], 10);
    const m = hhmm[2];
    const ampm = h >= 12 ? 'pm' : 'am';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`;
  }

  // Formats with am/pm suffix e.g. "10am", "630pm", "010am", "0630am"
  const ampmFmt = s.match(/^(\d+)(am|pm)$/);
  if (ampmFmt) {
    const num = ampmFmt[1];
    const ampm = ampmFmt[2];
    // If 3+ digits, last 2 are minutes, rest are hours
    // e.g. "010am" → num="010" → len 3 → hr=01=1, min=10 → but min 10 is unusual
    // Better: treat leading zeros as part of hour for short strings
    // "010am" should be 10am (user typed 010 meaning 10 o'clock)
    // "630am" should be 6:30am
    // "1030am" should be 10:30am
    if (num.length <= 2) {
      // Pure hour: "6am", "10am", "01am" → strip leading zero
      return `${parseInt(num, 10)}${ampm}`;
    } else if (num.length === 3) {
      // Could be "010" (=10am) or "630" (=6:30am)
      // If first char is 0, treat as zero-padded hour: "010" → 10am
      if (num[0] === '0') {
        return `${parseInt(num, 10)}${ampm}`; // "010" → parseInt=10 → "10am"
      }
      // Otherwise h=first digit, mm=last two: "630" → 6:30am
      const h = parseInt(num[0], 10);
      const m = num.slice(1);
      return m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`;
    } else {
      // 4 digits: "1030am" → 10:30am, "0630am" → 6:30am
      const h = parseInt(num.slice(0, -2), 10);
      const m = num.slice(-2);
      return m === '00' ? `${h}${ampm}` : `${h}:${m}${ampm}`;
    }
  }

  return s; // fallback
}

// Formats ISO date string to "14 May 2026" style
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function PriorityLegend() {
  return (
    <View style={s.legendRow}>
      {Object.entries(PRIORITY_CONFIG).map(([key, val]) => (
        <View key={key} style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: val.color }]} />
          <Text style={[s.legendLabel, { color: val.color }]}>{val.label}</Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({ stat }) {
  return (
    <View style={[s.statCard, stat.alert && s.statCardAlert, stat.good && s.statCardGood]}>
      <Text style={[s.statIcon, stat.alert && { color: C.critical }, stat.good && { color: C.light }]}>{stat.icon}</Text>
      <Text style={[s.statValue, stat.alert && { color: C.critical }, stat.good && { color: C.light }]}>{stat.value}</Text>
      <Text style={s.statLabel}>{stat.label}</Text>
    </View>
  );
}

function ConflictBanner({ description }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !description) return null;
  return (
    <View style={s.conflictBanner}>
      <View style={s.conflictLeft}>
        <Text style={s.conflictIcon}>⚠</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.conflictTitle}>AI CONFLICT DETECTED</Text>
          <Text style={s.conflictSub}>{description}</Text>
        </View>
      </View>
      <View style={s.conflictActions}>
        <TouchableOpacity style={s.conflictBtn}><Text style={s.conflictBtnText}>FIX</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setDismissed(true)}><Text style={s.conflictDismiss}>✕</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function LoadingState({ message }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={s.loadingState}>
      <Animated.Text style={[s.loadingIcon, { opacity: pulse }]}>◈</Animated.Text>
      <Text style={s.loadingText}>SYNCING WITH SENTRALIS</Text>
      <Text style={s.loadingSubText}>{message || 'Fetching your live data...'}</Text>
    </View>
  );
}

function TimelineItem({ item, index }) {
  const cfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.normal;
  const contextColor = item.contextColor || C.accent;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 320, delay: index * 55, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity activeOpacity={0.78} style={[s.timelineItem, { borderLeftColor: cfg.color }, item.conflict && s.timelineItemConflict]}>
        <View style={s.timeCol}>
          <Text style={s.itemTime}>{formatTime(item.time)}</Text>
          <View style={[s.priorityDot, { backgroundColor: cfg.color }]} />
        </View>
        <View style={s.itemBody}>
          <View style={s.tagRow}>
            <View style={[s.contextTag, { borderColor: contextColor + '55', backgroundColor: contextColor + '15' }]}>
              <Text style={[s.contextTagText, { color: contextColor }]}>{item.context.toUpperCase()}</Text>
            </View>
            {item.conflict && <View style={s.conflictTag}><Text style={s.conflictTagText}>⚠ CONFLICT</Text></View>}
            {item.needsApproval && <View style={s.approvalTag}><Text style={s.approvalTagText}>⏳ APPROVAL</Text></View>}
          </View>
          <Text style={s.itemTitle} numberOfLines={2}>{item.title}</Text>
          {item.detail ? <Text style={s.itemDetail}>{item.detail}</Text> : null}
          {item.location ? <Text style={s.itemLocation}>📍 {item.location}</Text> : null}
          {item.needsApproval && (
            <View style={s.approvalRow}>
              <TouchableOpacity style={s.approveBtn} onPress={async () => {
                if (CONFIG.USE_BACKEND && CONFIG.BACKEND_URL) {
                  try {
                    await fetch(`${CONFIG.BACKEND_URL}/api/events/${item.id}/approve`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ approvedBy: 'Rey' }),
                    });
                  } catch (err) { console.error('Approve error:', err); }
                }
              }}>
                <Text style={s.approveBtnText}>✓ APPROVE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.denyBtn}><Text style={s.denyBtnText}>✕ DENY</Text></TouchableOpacity>
            </View>
          )}
        </View>
        <View style={[s.priorityStrip, { backgroundColor: cfg.bg }]} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────
function TaskCard({ task, index, onComplete }) {
  const cfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
  const contextColor = task.contextColor || C.accent;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const checkScale = useRef(new Animated.Value(1)).current;
  const overdue  = SheetsService.isOverdue(task.dueDate) && task.status !== 'completed';
  const dueToday = SheetsService.isDueToday(task.dueDate) && task.status !== 'completed';
  const isDone   = task.status === 'completed' || task.status === 'done';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 320, delay: index * 55, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleComplete = () => {
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 1.4, duration: 120, useNativeDriver: true }),
      Animated.timing(checkScale, { toValue: 1,   duration: 120, useNativeDriver: true }),
    ]).start(() => onComplete(task));
  };

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={[s.taskCard, { borderLeftColor: isDone ? C.light : cfg.color }, overdue && s.taskCardOverdue, isDone && s.taskCardDone]}>
        <TouchableOpacity style={s.taskCheckbox} onPress={handleComplete} disabled={isDone} activeOpacity={0.7}>
          <Animated.View style={[s.checkboxInner, isDone && s.checkboxDone, { transform: [{ scale: checkScale }] }]}>
            {isDone && <Text style={s.checkboxTick}>✓</Text>}
          </Animated.View>
        </TouchableOpacity>
        <View style={s.taskBody}>
          <View style={s.tagRow}>
            <View style={[s.contextTag, { borderColor: contextColor + '55', backgroundColor: contextColor + '15' }]}>
              <Text style={[s.contextTagText, { color: contextColor }]}>{task.context.toUpperCase()}</Text>
            </View>
            {overdue  && <View style={s.overdueTag}><Text style={s.overdueTagText}>⚠ OVERDUE</Text></View>}
            {dueToday && !overdue && <View style={s.dueTodayTag}><Text style={s.dueTodayTagText}>📅 TODAY</Text></View>}
            {isDone   && <View style={s.doneTag}><Text style={s.doneTagText}>✓ DONE</Text></View>}
          </View>
          <Text style={[s.taskTitle, isDone && s.taskTitleDone]}>{task.title}</Text>
          {task.detail ? <Text style={s.taskDetail}>{task.detail}</Text> : null}
          <View style={s.taskMeta}>
            {task.dueDate ? <Text style={[s.taskDue, overdue && { color: C.critical }, dueToday && { color: C.important }]}>📅 Due: {formatDate(task.dueDate)}</Text> : null}
            {task.assignedTo ? <Text style={s.taskAssigned}>👤 {task.assignedTo}</Text> : null}
          </View>
        </View>
        <View style={[s.priorityStrip, { backgroundColor: cfg.bg }]} />
      </View>
    </Animated.View>
  );
}

// ─── TASKS SCREEN ─────────────────────────────────────────────────────────────
function TasksScreen() {
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState('all');
  const [dataSource, setDataSource] = useState('loading');

  const FALLBACK_TASKS = [
    { id: 'TSK001', title: 'Approve Youth Activity Budget PHP 3,500', context: 'Church', contextColor: '#F5C842', priority: 'normal', status: 'pending', dueDate: SheetsService.getTodayString(), assignedTo: 'Rey', detail: 'Youth committee requesting budget for activity' },
    { id: 'TSK002', title: 'Follow up Davao MCPro Prospect', context: 'MCPro', contextColor: '#3B82F6', priority: 'important', status: 'pending', dueDate: SheetsService.getTodayString(), assignedTo: 'Rey', detail: 'Send proposal after discovery call' },
    { id: 'TSK003', title: 'Review FY2026 Infrastructure Budget', context: 'Mayor', contextColor: '#FF3B3B', priority: 'critical', status: 'in-progress', dueDate: SheetsService.getTodayString(), assignedTo: 'Rey', detail: 'City Council budget review session' },
  ];

  const loadTasks = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      if (CONFIG.API_KEY) {
        const liveTasks = await SheetsService.fetchAllTasks();
        setTasks(liveTasks);
        setDataSource('live');
      } else {
        setTasks(FALLBACK_TASKS);
        setDataSource('fallback');
      }
    } catch (err) {
      setTasks(FALLBACK_TASKS);
      setDataSource('fallback');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadTasks(); }, []);

  const handleComplete = async (task) => {
    // Optimistically update UI immediately
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed' } : t));

    // Write back to Google Sheets via backend
    if (CONFIG.USE_BACKEND && CONFIG.BACKEND_URL) {
      try {
        await fetch(`${CONFIG.BACKEND_URL}/api/tasks/${task.id}/complete`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('Write-back error:', err);
        // UI already updated — silent fail for now
      }
    }
  };

  const FILTERS = [
    { id: 'all',       label: 'ALL' },
    { id: 'pending',   label: 'PENDING' },
    { id: 'overdue',   label: 'OVERDUE' },
    { id: 'completed', label: 'DONE' },
  ];

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all')       return true;
    if (filter === 'pending')   return t.status === 'pending' || t.status === 'in-progress';
    if (filter === 'overdue')   return SheetsService.isOverdue(t.dueDate) && t.status !== 'completed';
    if (filter === 'completed') return t.status === 'completed' || t.status === 'done';
    return true;
  });

  const pendingCount   = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
  const overdueCount   = tasks.filter(t => SheetsService.isOverdue(t.dueDate) && t.status !== 'completed').length;
  const completedCount = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;

  if (loading) {
    return (
      <View style={s.screen}>
        <View style={[s.header, { paddingHorizontal: 16, paddingTop: 16 }]}>
          <View><Text style={s.greeting}>Tasks</Text><Text style={s.dateLabel}>All contexts · All priorities</Text></View>
        </View>
        <LoadingState message="Loading your tasks..." />
      </View>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadTasks(true)} tintColor={C.accent} colors={[C.accent]} />}
    >
      <View style={s.header}>
        <View><Text style={s.greeting}>Tasks</Text><Text style={s.dateLabel}>All contexts · {tasks.length} total</Text></View>
        <TouchableOpacity style={s.voiceBtn} onPress={() => loadTasks(true)}><Text style={s.voiceBtnIcon}>↺</Text></TouchableOpacity>
      </View>

      {dataSource === 'live' && (
        <View style={s.liveIndicator}><View style={s.liveDot} /><Text style={s.liveText}>LIVE DATA · Pull down to refresh</Text></View>
      )}

      <View style={s.statsRow}>
        <View style={s.statCard}><Text style={s.statIcon}>◻</Text><Text style={s.statValue}>{pendingCount}</Text><Text style={s.statLabel}>Pending</Text></View>
        <View style={[s.statCard, overdueCount > 0 && s.statCardAlert]}>
          <Text style={[s.statIcon, overdueCount > 0 && { color: C.critical }]}>⚠</Text>
          <Text style={[s.statValue, overdueCount > 0 && { color: C.critical }]}>{overdueCount}</Text>
          <Text style={s.statLabel}>Overdue</Text>
        </View>
        <View style={[s.statCard, completedCount > 0 && s.statCardGood]}>
          <Text style={[s.statIcon, completedCount > 0 && { color: C.light }]}>✓</Text>
          <Text style={[s.statValue, completedCount > 0 && { color: C.light }]}>{completedCount}</Text>
          <Text style={s.statLabel}>Done</Text>
        </View>
        <View style={s.statCard}><Text style={s.statIcon}>◈</Text><Text style={s.statValue}>{tasks.length}</Text><Text style={s.statLabel}>Total</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[s.filterBtn, filter === f.id && s.filterBtnActive]} onPress={() => setFilter(f.id)}>
            <Text style={[s.filterBtnText, filter === f.id && s.filterBtnTextActive]}>
              {f.label}{f.id === 'overdue' && overdueCount > 0 ? ` (${overdueCount})` : ''}{f.id === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{filter === 'all' ? 'ALL TASKS' : filter === 'pending' ? 'PENDING TASKS' : filter === 'overdue' ? 'OVERDUE TASKS' : 'COMPLETED TASKS'}</Text>
        <Text style={s.sectionSub}>{filteredTasks.length} ITEMS</Text>
      </View>

      <PriorityLegend />

      {filteredTasks.some(t => t.status !== 'completed' && t.status !== 'done') && (
        <View style={s.hintBanner}><Text style={s.hintText}>◉ Tap the checkbox on any task to mark it complete</Text></View>
      )}

      {filteredTasks.length > 0 ? (
        <View style={s.taskList}>
          {filteredTasks.map((task, i) => <TaskCard key={task.id} task={task} index={i} onComplete={handleComplete} />)}
        </View>
      ) : (
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>◻</Text>
          <Text style={s.emptyTitle}>{filter === 'completed' ? 'No completed tasks yet' : filter === 'overdue' ? 'No overdue tasks' : 'No tasks found'}</Text>
          <Text style={s.emptySub}>{filter === 'completed' ? 'Complete a task to see it here' : filter === 'overdue' ? "You're on top of everything" : 'Add tasks to your Sentralis-Data sheet'}</Text>
        </View>
      )}

      <View style={s.writebackNote}>
        <Text style={s.writebackText}>◉ Completing a task updates your Google Sheet instantly via Sentralis Backend.</Text>
      </View>

      <View style={s.taglineFooter}><Text style={s.taglineName}>SENTRALIS</Text><Text style={s.taglineText}>Where Everything Connects</Text></View>
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ─── VOICE ASSISTANT ──────────────────────────────────────────────────────────
//
// Session 017 architecture — VAD + Barge-in:
//   Tap mic → record → VAD monitors audio levels in real time
//   → silence for 1.5s triggers auto-stop (no manual tap needed)
//   → instant local-first confirmation while Railway processes in background
//   → barge-in: tap mic while phone is speaking to interrupt and record again
//   → SQLite offline queue syncs silently in background
//
// VAD implementation:
//   expo-av getStatusAsync() returns metering (dBFS) when isMeteringEnabled=true
//   We poll every 150ms. If metering < SILENCE_THRESHOLD for SILENCE_DURATION ms
//   we consider the user done speaking and auto-trigger stopAndProcess().
//   A minimum recording guard (MIN_RECORD_MS) prevents false triggers on mic pop.
//
const VAD_CONFIG = {
  POLL_INTERVAL_MS:   150,   // how often we check audio level
  SILENCE_THRESHOLD:  -40,   // dBFS below this = silence (typical speech is -20 to -10)
  SILENCE_DURATION:   1500,  // ms of continuous silence before auto-stop
  MIN_RECORD_MS:      600,   // min ms to record before VAD can trigger (prevents mic pop false-stop)
};

function VoiceAssistant({ visible, onClose }) {
  const [phase, setPhase]           = useState('idle');    // idle | listening | processing | confirmed
  const [transcript, setTranscript] = useState('');
  const [replyText, setReplyText]   = useState('');
  const [history, setHistory]       = useState([]);
  const [errorMsg, setErrorMsg]     = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);        // 0-1 for waveform display
  const [silenceCountdown, setSilenceCountdown] = useState(0); // 0-1 for silence indicator

  const recordingRef       = useRef(null);
  const vadIntervalRef     = useRef(null);
  const silenceSinceRef    = useRef(null);  // timestamp when silence started
  const recordingStartRef  = useRef(null);  // timestamp when recording started
  const pulseAnim          = useRef(new Animated.Value(1)).current;
  const waveAnims          = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.15))
  ).current;

  // ── Waveform animation while listening ───────────────────────────────────────
  useEffect(() => {
    if (phase === 'listening') {
      // Each bar animates independently for a natural waveform look
      waveAnims.forEach((anim, i) => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0.2 + Math.random() * 0.8,
              duration: 200 + i * 80,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.1 + Math.random() * 0.3,
              duration: 200 + i * 60,
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
      // Pulse the mic ring
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])).start();
    } else {
      waveAnims.forEach(a => { a.stopAnimation(); a.setValue(0.15); });
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [phase]);

  // ── Init SQLite + background sync on open ────────────────────────────────────
  useEffect(() => {
    if (visible) {
      OfflineQueue.init();
      syncAndUpdateCount();
      const syncInterval = setInterval(syncAndUpdateCount, 30000);
      return () => clearInterval(syncInterval);
    }
  }, [visible]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopVAD();
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
      Speech.stop();
    };
  }, []);

  const syncAndUpdateCount = async () => {
    await OfflineQueue.syncAll();
    const pending = await OfflineQueue.getPending();
    setPendingCount(pending.length);
  };

  // ── VAD — start polling audio levels ─────────────────────────────────────────
  const startVAD = () => {
    silenceSinceRef.current = null;
    setSilenceCountdown(0);

    vadIntervalRef.current = setInterval(async () => {
      if (!recordingRef.current) return;
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (!status.isRecording) return;

        const db = status.metering ?? -160; // dBFS, 0 = max, -160 = silence
        // Normalize to 0-1 for display (typical speech range -50 to -5 dBFS)
        const normalized = Math.max(0, Math.min(1, (db + 60) / 55));
        setAudioLevel(normalized);

        const now = Date.now();
        const recordedMs = now - (recordingStartRef.current || now);

        // Only apply VAD after minimum recording guard
        if (recordedMs < VAD_CONFIG.MIN_RECORD_MS) return;

        if (db < VAD_CONFIG.SILENCE_THRESHOLD) {
          // Silence detected
          if (!silenceSinceRef.current) {
            silenceSinceRef.current = now;
          }
          const silenceMs = now - silenceSinceRef.current;
          const progress = Math.min(1, silenceMs / VAD_CONFIG.SILENCE_DURATION);
          setSilenceCountdown(progress);

          if (silenceMs >= VAD_CONFIG.SILENCE_DURATION) {
            // Silence held long enough — auto-stop
            console.log('[VAD] Silence threshold reached — auto-stopping');
            stopVAD();
            stopAndProcess();
          }
        } else {
          // Sound detected — reset silence timer
          silenceSinceRef.current = null;
          setSilenceCountdown(0);
        }
      } catch (e) {
        // Recording may have stopped externally — ignore
      }
    }, VAD_CONFIG.POLL_INTERVAL_MS);
  };

  const stopVAD = () => {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    silenceSinceRef.current = null;
    setSilenceCountdown(0);
    setAudioLevel(0);
  };

  // ── Speak confirmation — device TTS, no internet needed ──────────────────────
  const speakConfirmation = (text) => {
    Speech.stop();
    Speech.speak(text, { language: 'en-PH', pitch: 1.0, rate: 1.1 });
  };

  // ── Build instant confirmation text from classified data ─────────────────────
  const buildConfirmation = (type, data, context) => {
    const d = data || {};
    switch (type) {
      case 'task':
        return `Task saved. ${d.title || 'Task'}, ${context} context.`;
      case 'event':
        return `Event saved. ${d.title || 'Event'}${d.time ? ', at ' + d.time : ''}.`;
      case 'money':
        const amt = d.amount ? `${Number(d.amount).toLocaleString()} pesos` : '';
        const monType = d.type_money === 'income' ? 'income' : 'expense';
        return `${monType} logged. ${amt}, ${context}.`;
      case 'note':
        return `Note saved. ${context} context.`;
      case 'query':
        return null;
      default:
        return `Saved to ${context}.`;
    }
  };

  // ── Start recording + VAD ─────────────────────────────────────────────────────
  const startListening = async () => {
    try {
      setErrorMsg('');

      // ── BARGE-IN: if phone is speaking, stop it immediately ──────────────────
      Speech.stop();

      // Force unload any existing recording
      if (recordingRef.current) {
        stopVAD();
        try { await recordingRef.current.stopAndUnloadAsync(); } catch (e) {}
        recordingRef.current = null;
      }

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setErrorMsg('Microphone permission needed.'); return; }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      // Enable metering so VAD can read audio levels
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recordingRef.current = recording;
      recordingStartRef.current = Date.now();
      setPhase('listening');
      setTranscript('');
      setReplyText('');

      // Start VAD polling
      startVAD();

    } catch (e) {
      console.error('[VOICE] startListening error:', e);
      setErrorMsg('Could not start recording. Tap mic to retry.');
      setPhase('idle');
    }
  };

  // ── Stop recording + send — LOCAL FIRST ──────────────────────────────────────
  const stopAndProcess = async () => {
    stopVAD();
    if (!recordingRef.current) return;

    try {
      setPhase('processing');
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const todayISO = new Date().toISOString().split('T')[0];

      // ── INSTANT CONFIRMATION — user sees result immediately ───────────────────
      setTranscript('Processing your voice log...');
      setReplyText('Saving locally — syncing in background...');
      setPhase('confirmed');
      speakConfirmation('Got it. Saving now.');

      // ── BACKGROUND: Railway → Groq → Claude → Sheets ─────────────────────────
      (async () => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);

          const response = await fetch(`${CONFIG.BACKEND_URL}/api/voice/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_base64: base64Audio, format: 'm4a', history }),
            signal: controller.signal,
          });

          clearTimeout(timeout);
          const data = await response.json();

          const transcription = data.transcription || '';
          const type          = data.type           || 'note';
          const context       = data.context        || 'MCPro';
          const rawData       = data.data           || {};

          const classified = {
            title:       rawData.title       || transcription,
            description: rawData.description || transcription,
            priority:    rawData.priority    || 'normal',
            due_date:    rawData.due_date    || todayISO,
            date:        rawData.date        || todayISO,
            time:        rawData.time        || '09:00',
            location:    rawData.location    || '',
            amount:      rawData.amount      || 0,
            type_money:  rawData.type_money  || 'expense',
            category:    rawData.category    || '',
            assigned_to: rawData.assigned_to || 'Rey',
          };

          const validTypes = ['task', 'event', 'money', 'note'];
          if (validTypes.includes(type)) {
            await OfflineQueue.save(type, context, classified);
          }

          setTranscript(transcription);

          let confirmText = '';
          if (type === 'query' && data.response_text) {
            confirmText = data.response_text;
          } else {
            confirmText = buildConfirmation(type, classified, context);
            if (confirmText) speakConfirmation(confirmText);
          }
          setReplyText(confirmText || data.response_text || 'Saved.');

          if (transcription) {
            setHistory(prev => [
              ...prev.slice(-8),
              { role: 'user',      content: transcription },
              { role: 'assistant', content: confirmText || '' },
            ]);
          }

          syncAndUpdateCount();

        } catch (e) {
          console.error('[VOICE] Background process error:', e.message);
          setReplyText('Saved locally — will sync when connection improves.');
        }
      })();

    } catch (e) {
      console.error('[VOICE] stopAndProcess error:', e);
      setErrorMsg('Error processing. Tap mic to try again.');
      setPhase('idle');
    }
  };

  // ── Mic button — tap to start, tap again to cancel (barge-in on confirmed) ───
  const handleMicPress = async () => {
    if (phase === 'listening') {
      // Manual stop
      stopVAD();
      if (recordingRef.current) {
        try { await recordingRef.current.stopAndUnloadAsync(); recordingRef.current = null; } catch (e) {}
      }
      Speech.stop();
      setPhase('idle');
    } else {
      // Start — works from idle OR confirmed (barge-in after reply)
      if (phase === 'idle') { setHistory([]); }
      await startListening();
    }
  };

  if (!visible) return null;

  const phaseLabel = {
    idle:       'Tap mic to speak',
    listening:  'Listening — will stop when you pause',
    processing: 'Transcribing...',
    confirmed:  'Saved! Tap mic to log another.',
  }[phase];

  const phaseColor = {
    idle:       C.textDim,
    listening:  C.light,
    processing: C.accent,
    confirmed:  C.light,
  }[phase];

  // Silence bar — grows as silence threshold approaches
  const silenceBarWidth = `${Math.round(silenceCountdown * 100)}%`;

  return (
    <View style={s.voiceOverlay}>
      <View style={s.voiceCard}>

        {/* Header */}
        <View style={s.voiceHeader}>
          <Text style={s.voiceTitle}>◈ SENTRALIS VOICE</Text>
          <TouchableOpacity onPress={onClose} style={s.voiceCloseBtn}>
            <Text style={s.voiceCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Sync status */}
        {pendingCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, backgroundColor: C.importantBg, borderRadius: 8, padding: 8 }}>
            <Text style={{ fontSize: 10, color: C.important }}>⏳ {pendingCount} item{pendingCount > 1 ? 's' : ''} queued — will sync when online</Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <View style={s.liveDot} /><Text style={s.liveText}>ALL SYNCED</Text>
          </View>
        )}

        {/* Status */}
        <Text style={[s.voiceStatus, { color: phaseColor }]}>{phaseLabel}</Text>

        {/* ── WAVEFORM — visible while listening ── */}
        {phase === 'listening' && (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            {/* Audio level bars */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 40, marginBottom: 8 }}>
              {waveAnims.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={{
                    width: 5,
                    height: 40,
                    borderRadius: 3,
                    backgroundColor: C.light,
                    transform: [{ scaleY: anim }],
                    opacity: 0.85,
                  }}
                />
              ))}
            </View>

            {/* Silence countdown bar */}
            {silenceCountdown > 0 && (
              <View style={{ width: '100%', marginTop: 4 }}>
                <Text style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5, marginBottom: 3, textAlign: 'center' }}>
                  AUTO-STOPPING...
                </Text>
                <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{
                    height: 3,
                    width: silenceBarWidth,
                    backgroundColor: C.important,
                    borderRadius: 2,
                  }} />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Transcript */}
        {transcript ? (
          <View style={s.voiceTranscript}>
            <Text style={s.voiceTranscriptLabel}>YOU SAID</Text>
            <Text style={s.voiceTranscriptText}>{transcript}</Text>
          </View>
        ) : null}

        {/* Reply / Confirmation */}
        {replyText ? (
          <View style={[s.voiceReply, phase === 'confirmed' && { borderColor: C.light + '44', backgroundColor: C.lightBg }]}>
            <Text style={[s.voiceReplyLabel, phase === 'confirmed' && { color: C.light }]}>
              {phase === 'confirmed' ? '✓ SAVED' : 'SENTRALIS'}
            </Text>
            <Text style={s.voiceReplyText}>{replyText}</Text>
          </View>
        ) : null}

        {/* Error */}
        {errorMsg ? <Text style={s.voiceError}>{errorMsg}</Text> : null}

        {/* Mic Button */}
        <View style={s.voiceMicWrap}>
          <Animated.View style={[
            s.voiceMicRing,
            phase === 'listening'  && { borderColor: C.light + '88' },
            phase === 'confirmed'  && { borderColor: C.light + '55' },
            { transform: [{ scale: pulseAnim }] },
          ]}>
            <TouchableOpacity
              style={[
                s.voiceMicBtn,
                phase === 'listening'  && { backgroundColor: C.critical },
                phase === 'confirmed'  && { backgroundColor: C.light + 'CC' },
              ]}
              onPress={handleMicPress}
              activeOpacity={0.8}
            >
              <Text style={s.voiceMicIcon}>
                {phase === 'idle'       ? '🎤'
                : phase === 'listening' ? '⏹'
                : phase === 'processing'? '⏳'
                :                        '✓'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* Hint */}
        <Text style={s.voiceHint}>
          {phase === 'listening'
            ? 'Stops automatically when you pause · tap ⏹ to cancel'
            : phase === 'confirmed'
            ? 'Tap mic to log another · tap mic to interrupt reply'
            : phase === 'idle'
            ? 'Say a task, event, expense, or question'
            : ''}
        </Text>

      </View>
    </View>
  );
}

// ─── COMMAND SCREEN ───────────────────────────────────────────────────────────
function CommandScreen() {
  const [events, setEvents]             = useState([]);
  const [tasks, setTasks]               = useState([]);
  const [moneyRecords, setMoneyRecords] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [conflictDesc, setConflictDesc] = useState(null);
  const [dataSource, setDataSource]     = useState('loading');
  const [voiceVisible, setVoiceVisible] = useState(false);

  const FALLBACK_EVENTS = [
    { id: 'F1', time: '06:00', title: 'Morning Prayer & Devotional', context: 'Family', contextColor: '#4ADE80', priority: 'light', detail: 'Personal scripture study before the household wakes', location: 'Home', conflict: false, needsApproval: false },
    { id: 'F2', time: '07:30', title: 'Ward Bishopric Meeting', context: 'Church', contextColor: '#F5C842', priority: 'normal', detail: '2nd Counselor + Exec. Secretary · Chapel, Rm 3', location: 'Chapel Room 3', conflict: false, needsApproval: false },
    { id: 'F3', time: '09:00', title: 'City Council — Budget Review', context: 'Mayor', contextColor: '#FF3B3B', priority: 'critical', detail: 'FY2026 Infrastructure allocation · City Hall, Session Room', location: 'City Hall', conflict: true, needsApproval: false },
    { id: 'F4', time: '09:30', title: 'MCPro Client Discovery Call', context: 'MCPro', contextColor: '#3B82F6', priority: 'important', detail: 'Onboarding — Davao wholesale prospect', location: 'Virtual', conflict: true, needsApproval: false },
    { id: 'F5', time: '16:00', title: 'Youth Activity — Approval Needed', context: 'Church', contextColor: '#F5C842', priority: 'normal', detail: 'Youth committee requesting activity budget PHP 3,500', location: 'Chapel', conflict: false, needsApproval: true },
    { id: 'F6', time: '19:00', title: 'Family Dinner + Homework Time', context: 'Family', contextColor: '#4ADE80', priority: 'light', detail: 'Kids: Miguel, Ana, Jose, Lucia, Bea · check assignments', location: 'Home', conflict: false, needsApproval: false },
    { id: 'F7', time: '21:00', title: 'Sentralis Dev Session', context: 'MCPro', contextColor: '#3B82F6', priority: 'important', detail: 'Session 011 — Dashboard intelligence live', location: 'Home Office', conflict: false, needsApproval: false },
  ];
  const FALLBACK_TASKS = [
    { id: 'TSK001', title: 'Approve Youth Activity Budget PHP 3,500', context: 'Church', contextColor: '#F5C842', priority: 'normal', status: 'pending', dueDate: SheetsService.getTodayString(), assignedTo: 'Rey' },
    { id: 'TSK002', title: 'Follow up Davao MCPro Prospect', context: 'MCPro', contextColor: '#3B82F6', priority: 'important', status: 'pending', dueDate: SheetsService.getTodayString(), assignedTo: 'Rey' },
    { id: 'TSK003', title: 'Review FY2026 Infrastructure Budget', context: 'Mayor', contextColor: '#FF3B3B', priority: 'critical', status: 'in-progress', dueDate: SheetsService.getTodayString(), assignedTo: 'Rey' },
  ];
  const FALLBACK_MONEY = [
    { id: 'M1', type: 'income',  amount: 15000, context: 'MCPro',   description: 'Client payment' },
    { id: 'M2', type: 'expense', amount: 3500,  context: 'Church',  description: 'Youth activity' },
    { id: 'M3', type: 'expense', amount: 800,   context: 'Family',  description: 'Groceries' },
  ];

  // ── Parallel fetch: Events + Tasks + Money all at once ──────────────────────
  const loadAll = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      if (CONFIG.API_KEY) {
        const [liveEvents, liveTasks, liveMoney] = await Promise.all([
          SheetsService.fetchTodayEvents(),
          SheetsService.fetchAllTasks(),
          SheetsService.fetchAllMoney(),
        ]);
        setEvents(liveEvents);
        setTasks(liveTasks);
        setMoneyRecords(liveMoney);
        setConflictDesc(SheetsService.buildConflictDescription(liveEvents));
        setDataSource('live');
      } else {
        setEvents(FALLBACK_EVENTS);
        setTasks(FALLBACK_TASKS);
        setMoneyRecords(FALLBACK_MONEY);
        setConflictDesc(SheetsService.buildConflictDescription(FALLBACK_EVENTS));
        setDataSource('fallback');
      }
    } catch (err) {
      setEvents(FALLBACK_EVENTS);
      setTasks(FALLBACK_TASKS);
      setMoneyRecords(FALLBACK_MONEY);
      setConflictDesc(SheetsService.buildConflictDescription(FALLBACK_EVENTS));
      setDataSource('fallback');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadAll(); }, []);

  // ── Derived intelligence values ─────────────────────────────────────────────
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr  = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const pendingTasks  = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress');
  const overdueTasks  = tasks.filter(t => SheetsService.isOverdue(t.dueDate) && t.status !== 'completed' && t.status !== 'done');
  const conflicts     = events.filter(e => e.conflict);
  const needsApproval = events.filter(e => e.needsApproval);

  const todayIncome  = moneyRecords.filter(r => r.type === 'income'  && r.date === SheetsService.getTodayString()).reduce((s, r) => s + r.amount, 0);
  const todayExpense = moneyRecords.filter(r => r.type === 'expense' && r.date === SheetsService.getTodayString()).reduce((s, r) => s + r.amount, 0);
  const totalIncome  = moneyRecords.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const totalExpense = moneyRecords.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const netBalance   = totalIncome - totalExpense;

  // ── Smart AI briefing message ────────────────────────────────────────────────
  const buildBriefing = () => {
    const parts = [];
    if (conflicts.length > 0)     parts.push(`${conflicts.length} schedule conflict${conflicts.length > 1 ? 's' : ''}`);
    if (overdueTasks.length > 0)  parts.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`);
    if (needsApproval.length > 0) parts.push(`${needsApproval.length} item${needsApproval.length > 1 ? 's' : ''} needing your approval`);
    if (parts.length === 0) {
      if (pendingTasks.length > 0) return `You have ${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''} today. No conflicts — clear schedule.`;
      return 'All clear today. No conflicts, no overdue tasks. Good day ahead, Rey.';
    }
    return `Attention needed: ${parts.join(', ')}.`;
  };

  const fmt = (n) => n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  if (loading) {
    return (
      <View style={s.screen}>
        <View style={[s.header, { paddingHorizontal: 16, paddingTop: 16 }]}>
          <View><Text style={s.greeting}>{greeting}, Rey</Text><Text style={s.dateLabel}>{dateStr}</Text></View>
        </View>
        <LoadingState message="Syncing all modules..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={s.screen} contentContainerStyle={s.screenContent} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor={C.accent} colors={[C.accent]} />}
    >
      {/* ── Header ── */}
      <View style={s.header}>
        <View><Text style={s.greeting}>{greeting}, Rey</Text><Text style={s.dateLabel}>{dateStr}</Text></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[s.voiceBtn, { backgroundColor: '#1A1F2E', borderColor: C.light + '66' }]} onPress={() => setVoiceVisible(true)}>
            <Text style={[s.voiceBtnIcon, { color: C.light }]}>🎤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.voiceBtn} onPress={() => loadAll(true)}>
            <Text style={s.voiceBtnIcon}>↺</Text>
          </TouchableOpacity>
        </View>
      </View>

      {dataSource === 'live' && (
        <View style={s.liveIndicator}><View style={s.liveDot} /><Text style={s.liveText}>LIVE · All modules synced</Text></View>
      )}

      {/* ── AI Briefing Strip ── */}
      <View style={[s.aiStrip, (conflicts.length > 0 || overdueTasks.length > 0) && { borderColor: C.critical + '55', backgroundColor: C.criticalBg }]}>
        <Text style={s.aiIcon}>◈</Text>
        <Text style={s.aiText}>{buildBriefing()}</Text>
      </View>

      {/* ── Conflict Banner ── */}
      <ConflictBanner description={conflictDesc} />

      {/* ── Module Summary Row ── */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>TODAY AT A GLANCE</Text>
        <Text style={s.sectionSub}>ALL CONTEXTS</Text>
      </View>

      {/* Row 1: Events + Tasks */}
      <View style={[s.statsRow, { marginBottom: 8 }]}>
        <View style={[s.dashCard, { borderLeftColor: C.accent }]}>
          <Text style={s.dashCardIcon}>◷</Text>
          <Text style={s.dashCardValue}>{events.length}</Text>
          <Text style={s.dashCardLabel}>Events Today</Text>
          {conflicts.length > 0 && (
            <View style={s.dashCardAlert}><Text style={s.dashCardAlertText}>⚠ {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}</Text></View>
          )}
        </View>
        <View style={[s.dashCard, { borderLeftColor: overdueTasks.length > 0 ? C.critical : C.normal }]}>
          <Text style={s.dashCardIcon}>◻</Text>
          <Text style={[s.dashCardValue, overdueTasks.length > 0 && { color: C.critical }]}>{pendingTasks.length}</Text>
          <Text style={s.dashCardLabel}>Tasks Pending</Text>
          {overdueTasks.length > 0 && (
            <View style={[s.dashCardAlert, { backgroundColor: C.critical + '22' }]}><Text style={[s.dashCardAlertText, { color: C.critical }]}>⚠ {overdueTasks.length} overdue</Text></View>
          )}
        </View>
      </View>

      {/* Row 2: Money summary */}
      <View style={[s.statsRow, { marginBottom: 14 }]}>
        <View style={[s.dashCard, { borderLeftColor: C.light }]}>
          <Text style={s.dashCardIcon}>▲</Text>
          <Text style={[s.dashCardValue, { color: C.light, fontSize: 14 }]}>₱{fmt(totalIncome)}</Text>
          <Text style={s.dashCardLabel}>Total Income</Text>
        </View>
        <View style={[s.dashCard, { borderLeftColor: C.critical }]}>
          <Text style={s.dashCardIcon}>▼</Text>
          <Text style={[s.dashCardValue, { color: C.critical, fontSize: 14 }]}>₱{fmt(totalExpense)}</Text>
          <Text style={s.dashCardLabel}>Total Expenses</Text>
        </View>
        <View style={[s.dashCard, { borderLeftColor: netBalance >= 0 ? C.light : C.critical }]}>
          <Text style={s.dashCardIcon}>◈</Text>
          <Text style={[s.dashCardValue, { color: netBalance >= 0 ? C.light : C.critical, fontSize: 14 }]}>₱{fmt(Math.abs(netBalance))}</Text>
          <Text style={s.dashCardLabel}>{netBalance >= 0 ? 'Net Surplus' : 'Net Deficit'}</Text>
        </View>
      </View>

      {/* ── Top Priority Tasks ── */}
      {pendingTasks.length > 0 && (
        <>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>TOP PRIORITY TASKS</Text>
            <Text style={s.sectionSub}>{pendingTasks.length} PENDING</Text>
          </View>
          <View style={{ gap: 6, marginBottom: 14 }}>
            {pendingTasks
              .sort((a, b) => {
                const order = { critical: 0, important: 1, normal: 2, light: 3 };
                return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
              })
              .slice(0, 3)
              .map((task) => {
                const cfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
                const isOverdue = SheetsService.isOverdue(task.dueDate);
                return (
                  <View key={task.id} style={[s.dashTaskRow, { borderLeftColor: isOverdue ? C.critical : cfg.color }]}>
                    <View style={[s.priorityDot, { backgroundColor: cfg.color, marginTop: 2 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.dashTaskTitle} numberOfLines={1}>{task.title}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                        <Text style={[s.dashTaskMeta, { color: CONTEXT_COLORS[task.context] || C.accent }]}>{task.context}</Text>
                        {isOverdue && <Text style={[s.dashTaskMeta, { color: C.critical }]}>⚠ OVERDUE</Text>}
                        {task.dueDate && !isOverdue && <Text style={s.dashTaskMeta}>Due {formatDate(task.dueDate)}</Text>}
                      </View>
                    </View>
                    <View style={[{ width: 6, alignSelf: 'stretch', borderRadius: 4, backgroundColor: cfg.color + '55' }]} />
                  </View>
                );
              })}
            {pendingTasks.length > 3 && (
              <Text style={{ fontSize: 10, color: C.textDim, textAlign: 'center', paddingVertical: 4 }}>
                +{pendingTasks.length - 3} more tasks — see Tasks tab
              </Text>
            )}
          </View>
        </>
      )}

      {/* ── Today's Timeline ── */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>TODAY'S TIMELINE</Text>
        <Text style={s.sectionSub}>ALL CONTEXTS · {events.length} EVENTS</Text>
      </View>
      <PriorityLegend />

      {events.length > 0 ? (
        <View style={s.timeline}>{events.map((item, i) => <TimelineItem key={item.id} item={item} index={i} />)}</View>
      ) : (
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>◈</Text>
          <Text style={s.emptyTitle}>No events today</Text>
          <Text style={s.emptySub}>Add events to your Sentralis-Data sheet</Text>
        </View>
      )}

      <View style={s.taglineFooter}><Text style={s.taglineName}>SENTRALIS</Text><Text style={s.taglineText}>Where Everything Connects</Text></View>
      <View style={{ height: 24 }} />
    </ScrollView>

    <VoiceAssistant visible={voiceVisible} onClose={() => setVoiceVisible(false)} />
    </View>
  );
}

// ─── PERSON CARD ──────────────────────────────────────────────────────────────
function PersonCard({ person, index, onPress }) {
  const contextColor = person.contextColor || C.accent;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 320, delay: index * 45, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 320, delay: index * 45, useNativeDriver: true }),
    ]).start();
  }, []);

  // Generate initials avatar
  const initials = person.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity activeOpacity={0.78} style={s.personCard} onPress={() => onPress(person)}>
        {/* Avatar */}
        <View style={[s.personAvatar, { backgroundColor: contextColor + '22', borderColor: contextColor + '55' }]}>
          <Text style={[s.personInitials, { color: contextColor }]}>{initials}</Text>
        </View>

        {/* Info */}
        <View style={s.personInfo}>
          <View style={s.tagRow}>
            <View style={[s.contextTag, { borderColor: contextColor + '55', backgroundColor: contextColor + '15' }]}>
              <Text style={[s.contextTagText, { color: contextColor }]}>{person.context.toUpperCase()}</Text>
            </View>
            {person.priority === 'critical' && (
              <View style={s.criticalTag}>
                <Text style={s.criticalTagText}>★ CRITICAL</Text>
              </View>
            )}
          </View>
          <Text style={s.personName}>{person.name}</Text>
          {person.role ? <Text style={s.personRole}>{person.role}</Text> : null}
          <View style={s.personMeta}>
            {person.phone ? <Text style={s.personMetaText}>📞 {person.phone}</Text> : null}
            {person.email ? <Text style={s.personMetaText}>✉ {person.email}</Text> : null}
            {person.address ? <Text style={s.personMetaText}>📍 {person.address}</Text> : null}
          </View>
          {person.notes ? <Text style={s.personNotes}>{person.notes}</Text> : null}
        </View>

        {/* Arrow */}
        <Text style={s.personArrow}>›</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── PERSON DETAIL MODAL ──────────────────────────────────────────────────────
function PersonDetail({ person, onClose }) {
  if (!person) return null;
  const contextColor = person.contextColor || C.accent;
  const initials = person.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <View style={s.detailOverlay}>
      <View style={s.detailCard}>
        {/* Header */}
        <View style={s.detailHeader}>
          <View style={[s.detailAvatar, { backgroundColor: contextColor + '22', borderColor: contextColor + '55' }]}>
            <Text style={[s.detailInitials, { color: contextColor }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.detailName}>{person.name}</Text>
            {person.nickname ? <Text style={s.detailNickname}>"{person.nickname}"</Text> : null}
            <View style={[s.contextTag, { borderColor: contextColor + '55', backgroundColor: contextColor + '15', alignSelf: 'flex-start', marginTop: 4 }]}>
              <Text style={[s.contextTagText, { color: contextColor }]}>{person.context.toUpperCase()}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={s.detailClose}>
            <Text style={s.detailCloseText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Details */}
          {[
            { icon: '👤', label: 'Role',         value: person.role },
            { icon: '📞', label: 'Phone',        value: person.phone },
            { icon: '✉',  label: 'Email',        value: person.email },
            { icon: '🎂', label: 'Birthday',     value: person.birthday },
            { icon: '📍', label: 'Address',      value: person.address },
            { icon: '📅', label: 'Last Contact', value: person.lastContact },
            { icon: '📝', label: 'Notes',        value: person.notes },
          ].filter(f => f.value).map(field => (
            <View key={field.label} style={s.detailRow}>
              <Text style={s.detailIcon}>{field.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.detailLabel}>{field.label}</Text>
                <Text style={s.detailValue}>{field.value}</Text>
              </View>
            </View>
          ))}

          {/* Action buttons */}
          <View style={s.detailActions}>
            {person.phone && (
              <TouchableOpacity style={s.detailActionBtn}>
                <Text style={s.detailActionIcon}>📞</Text>
                <Text style={s.detailActionText}>Call</Text>
              </TouchableOpacity>
            )}
            {person.email && (
              <TouchableOpacity style={s.detailActionBtn}>
                <Text style={s.detailActionIcon}>✉</Text>
                <Text style={s.detailActionText}>Email</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.detailActionBtn}>
              <Text style={s.detailActionIcon}>📝</Text>
              <Text style={s.detailActionText}>Log</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── PEOPLE SCREEN ────────────────────────────────────────────────────────────
function PeopleScreen() {
  const [people, setPeople]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState('all');
  const [selected, setSelected]     = useState(null);
  const [dataSource, setDataSource] = useState('loading');

  const FALLBACK_PEOPLE = [
    { id: 'PEO001', name: 'Rey Wife', nickname: '', context: 'Family', contextColor: '#4ADE80', role: 'Spouse', phone: '', email: '', birthday: '', address: 'Cebu City', notes: 'Shared app access', priority: 'critical', lastContact: '' },
    { id: 'PEO002', name: 'Miguel', nickname: '', context: 'Family', contextColor: '#4ADE80', role: 'Child', phone: '', email: '', birthday: '', address: 'Home', notes: 'Eldest child', priority: 'critical', lastContact: '' },
    { id: 'PEO003', name: 'Ana', nickname: '', context: 'Family', contextColor: '#4ADE80', role: 'Child', phone: '', email: '', birthday: '', address: 'Home', notes: '', priority: 'critical', lastContact: '' },
    { id: 'PEO004', name: 'Jose', nickname: '', context: 'Family', contextColor: '#4ADE80', role: 'Child', phone: '', email: '', birthday: '', address: 'Home', notes: '', priority: 'critical', lastContact: '' },
    { id: 'PEO005', name: 'Lucia', nickname: '', context: 'Family', contextColor: '#4ADE80', role: 'Child', phone: '', email: '', birthday: '', address: 'Home', notes: '', priority: 'critical', lastContact: '' },
    { id: 'PEO006', name: 'Bea', nickname: '', context: 'Family', contextColor: '#4ADE80', role: 'Child', phone: '', email: '', birthday: '', address: 'Home', notes: 'Youngest', priority: 'critical', lastContact: '' },
  ];

  const loadPeople = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      if (CONFIG.API_KEY) {
        const livePeople = await SheetsService.fetchAllPeople();
        setPeople(livePeople);
        setDataSource('live');
      } else {
        setPeople(FALLBACK_PEOPLE);
        setDataSource('fallback');
      }
    } catch (err) {
      setPeople(FALLBACK_PEOPLE);
      setDataSource('fallback');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadPeople(); }, []);

  // Build context filter options dynamically from data
  const contexts = ['all', ...new Set(people.map(p => p.context).filter(Boolean))];

  const filteredPeople = filter === 'all'
    ? people
    : people.filter(p => p.context === filter);

  // Group by context for display
  const grouped = filteredPeople.reduce((acc, p) => {
    const key = p.context || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  if (loading) {
    return (
      <View style={s.screen}>
        <View style={[s.header, { paddingHorizontal: 16, paddingTop: 16 }]}>
          <View><Text style={s.greeting}>People</Text><Text style={s.dateLabel}>All contexts · All roles</Text></View>
        </View>
        <LoadingState message="Loading your contacts..." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={s.screen}
        contentContainerStyle={s.screenContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPeople(true)} tintColor={C.accent} colors={[C.accent]} />}
      >
        {/* Header */}
        <View style={s.header}>
          <View><Text style={s.greeting}>People</Text><Text style={s.dateLabel}>All contexts · {people.length} contacts</Text></View>
          <TouchableOpacity style={s.voiceBtn} onPress={() => loadPeople(true)}><Text style={s.voiceBtnIcon}>↺</Text></TouchableOpacity>
        </View>

        {/* Live indicator */}
        {dataSource === 'live' && (
          <View style={s.liveIndicator}><View style={s.liveDot} /><Text style={s.liveText}>LIVE DATA · Pull down to refresh</Text></View>
        )}

        {/* Stats */}
        <View style={s.statsRow}>
          {Object.entries(
            people.reduce((acc, p) => { acc[p.context] = (acc[p.context] || 0) + 1; return acc; }, {})
          ).slice(0, 4).map(([ctx, count]) => (
            <View key={ctx} style={s.statCard}>
              <Text style={[s.statIcon, { color: CONTEXT_COLORS[ctx] || C.accent }]}>◎</Text>
              <Text style={[s.statValue, { color: CONTEXT_COLORS[ctx] || C.accent }]}>{count}</Text>
              <Text style={s.statLabel}>{ctx.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {/* Context filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filterRow}>
          {contexts.map(ctx => (
            <TouchableOpacity key={ctx} style={[s.filterBtn, filter === ctx && s.filterBtnActive]} onPress={() => setFilter(ctx)}>
              <Text style={[s.filterBtnText, filter === ctx && s.filterBtnTextActive]}>
                {ctx === 'all' ? 'ALL' : ctx.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Section label */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{filter === 'all' ? 'ALL CONTACTS' : filter.toUpperCase()}</Text>
          <Text style={s.sectionSub}>{filteredPeople.length} PEOPLE</Text>
        </View>

        {/* People list — grouped by context */}
        {filter === 'all' ? (
          Object.entries(grouped).map(([ctx, ctxPeople]) => (
            <View key={ctx} style={{ marginBottom: 8 }}>
              <View style={s.groupHeader}>
                <View style={[s.groupDot, { backgroundColor: CONTEXT_COLORS[ctx] || C.accent }]} />
                <Text style={[s.groupLabel, { color: CONTEXT_COLORS[ctx] || C.accent }]}>{ctx.toUpperCase()}</Text>
                <Text style={s.groupCount}>{ctxPeople.length}</Text>
              </View>
              {ctxPeople.map((person, i) => (
                <PersonCard key={person.id} person={person} index={i} onPress={setSelected} />
              ))}
            </View>
          ))
        ) : (
          <View style={s.taskList}>
            {filteredPeople.map((person, i) => (
              <PersonCard key={person.id} person={person} index={i} onPress={setSelected} />
            ))}
          </View>
        )}

        {filteredPeople.length === 0 && (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>◎</Text>
            <Text style={s.emptyTitle}>No contacts found</Text>
            <Text style={s.emptySub}>Add people to your Sentralis-Data sheet</Text>
          </View>
        )}

        {/* Hint */}
        <View style={s.writebackNote}>
          <Text style={s.writebackText}>◉ Tap any contact to see full details. Add contacts directly in your Sentralis-Data sheet.</Text>
        </View>

        <View style={s.taglineFooter}><Text style={s.taglineName}>SENTRALIS</Text><Text style={s.taglineText}>Where Everything Connects</Text></View>
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Person detail overlay */}
      {selected && <PersonDetail person={selected} onClose={() => setSelected(null)} />}
    </View>
  );
}



// ─── MONEY SCREEN ─────────────────────────────────────────────────────────────
function MoneyScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    try {
      const data = await SheetsService.fetchAllMoney();
      setRecords(data);
    } catch (e) {
      console.error('MoneyScreen load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const income   = records.filter(r => r.type === 'income');
  const expenses = records.filter(r => r.type === 'expense');
  const totalIn  = income.reduce((s, r) => s + r.amount, 0);
  const totalOut = expenses.reduce((s, r) => s + r.amount, 0);
  const net      = totalIn - totalOut;

  const FILTERS = ['ALL', 'INCOME', 'EXPENSE', 'TRANSFER'];
  const filtered = filter === 'ALL' ? records
    : records.filter(r => r.type === filter.toLowerCase());

  const fmt = (n) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* Header */}
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>Money</Text>
          <Text style={s.screenSub}>Financial overview</Text>
        </View>

        {/* Live indicator */}
        <View style={s.liveIndicator}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE DATA · Pull down to refresh</Text>
        </View>

        {/* Summary cards */}
        <View style={s.statsRow}>
          <View style={[s.statCard, { borderColor: C.light + '44' }]}>
            <Text style={s.statIcon}>▲</Text>
            <Text style={[s.statValue, { color: C.light, fontSize: 14 }]}>₱{fmt(totalIn)}</Text>
            <Text style={s.statLabel}>Income</Text>
          </View>
          <View style={[s.statCard, { borderColor: C.critical + '44' }]}>
            <Text style={s.statIcon}>▼</Text>
            <Text style={[s.statValue, { color: C.critical, fontSize: 14 }]}>₱{fmt(totalOut)}</Text>
            <Text style={s.statLabel}>Expenses</Text>
          </View>
          <View style={[s.statCard, { borderColor: (net >= 0 ? C.light : C.critical) + '44' }]}>
            <Text style={s.statIcon}>◈</Text>
            <Text style={[s.statValue, { color: net >= 0 ? C.light : C.critical, fontSize: 14 }]}>₱{fmt(Math.abs(net))}</Text>
            <Text style={s.statLabel}>{net >= 0 ? 'Surplus' : 'Deficit'}</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {FILTERS.map(f => {
              const count = f === 'ALL' ? records.length : records.filter(r => r.type === f.toLowerCase()).length;
              const active = filter === f;
              return (
                <TouchableOpacity key={f} onPress={() => setFilter(f)}
                  style={[s.filterTab, active && s.filterTabActive]}>
                  <Text style={[s.filterTabText, active && s.filterTabTextActive]}>
                    {f}{count > 0 ? ` (${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Records list */}
        {loading ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>◈</Text>
            <Text style={s.emptyTitle}>Loading...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>◈</Text>
            <Text style={s.emptyTitle}>No records found</Text>
            <Text style={s.emptySub}>Add entries to your Money sheet in Sentralis-Data</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {filtered.map((rec, i) => {
              const isIncome = rec.type === 'income';
              const isExpense = rec.type === 'expense';
              const amtColor = isIncome ? C.light : isExpense ? C.critical : C.accent;
              const amtPrefix = isIncome ? '+' : isExpense ? '-' : '↔';
              return (
                <View key={rec.id || i} style={[s.bgCard, {
                  backgroundColor: C.bgCard,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderLeftWidth: 3,
                  borderLeftColor: amtColor,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                }]}>
                  {/* Amount block */}
                  <View style={{ alignItems: 'flex-end', minWidth: 80 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: amtColor }}>
                      {amtPrefix}₱{fmt(rec.amount)}
                    </Text>
                    <Text style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{rec.currency}</Text>
                  </View>

                  {/* Divider */}
                  <View style={{ width: 1, height: 36, backgroundColor: C.border }} />

                  {/* Details */}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {rec.context ? (
                        <View style={[s.contextTag, { borderColor: rec.contextColor + '55', backgroundColor: rec.contextColor + '15' }]}>
                          <Text style={[s.contextTagText, { color: rec.contextColor }]}>{rec.context.toUpperCase()}</Text>
                        </View>
                      ) : null}
                      {rec.category ? (
                        <View style={[s.contextTag, { borderColor: C.accent + '33', backgroundColor: C.accentSoft }]}>
                          <Text style={[s.contextTagText, { color: C.accent }]}>{rec.category.toUpperCase()}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{rec.description || rec.type}</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {rec.date ? <Text style={{ fontSize: 10, color: C.textDim }}>📅 {formatDate(rec.date)}</Text> : null}
                      {rec.account ? <Text style={{ fontSize: 10, color: C.textDim }}>🏦 {rec.account}</Text> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={s.taglineFooter}><Text style={s.taglineName}>SENTRALIS</Text><Text style={s.taglineText}>Where Everything Connects</Text></View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}


// ─── TIME SCREEN ──────────────────────────────────────────────────────────────
function TimeScreen() {
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView]         = useState('TODAY');   // TODAY | WEEK | ALL
  const [selectedEvent, setSelectedEvent] = useState(null);

  const load = useCallback(async () => {
    try {
      const rows = await SheetsService.fetchSheet('Events!A1:O100');
      if (rows.length < 2) { setEvents([]); return; }
      const headers = rows[0];
      const all = rows.slice(1)
        .map(row => SheetsService.parseEvent(row, headers))
        .filter(e => e.id !== '' && e.status === 'active')
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      setEvents(all);
    } catch (e) {
      console.error('TimeScreen load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const today = SheetsService.getTodayString();

  // Week range helper
  const getWeekRange = () => {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return [fmt(mon), fmt(sun)];
  };

  const [weekStart, weekEnd] = getWeekRange();

  // WEEK = past 7 days up to today, so past events are always visible
  const sevenDaysAgo = (() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  const filtered = view === 'TODAY' ? events.filter(e => e.date === today)
    : view === 'WEEK'  ? events.filter(e => e.date >= sevenDaysAgo && e.date <= today)
    : events;

  // Group by date for ALL/WEEK view
  const grouped = filtered.reduce((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const isToday = dateStr === today;
    return `${isToday ? 'TODAY · ' : ''}${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const VIEWS = ['TODAY', 'WEEK', 'ALL'];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {/* Header */}
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>Time</Text>
          <Text style={s.screenSub}>Schedule & calendar</Text>
        </View>

        {/* Live indicator */}
        <View style={s.liveIndicator}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>LIVE DATA · Pull down to refresh</Text>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          {[
            { label: "Today",    value: String(events.filter(e => e.date === today).length),   icon: "◷" },
            { label: "This Week",value: String(events.filter(e => e.date >= weekStart && e.date <= weekEnd).length), icon: "◈" },
            { label: "Conflicts",value: String(events.filter(e => e.conflict).length),         icon: "⚠", alert: events.filter(e => e.conflict).length > 0 },
            { label: "Total",    value: String(events.length),                                  icon: "✦" },
          ].map((st, i) => (
            <View key={i} style={[s.statCard, st.alert && s.statCardAlert]}>
              <Text style={s.statIcon}>{st.icon}</Text>
              <Text style={s.statValue}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* View tabs */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {VIEWS.map(v => (
            <TouchableOpacity key={v} onPress={() => setView(v)}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                backgroundColor: view === v ? C.accent + '22' : C.bgCard,
                borderWidth: 1,
                borderColor: view === v ? C.accent : C.border,
              }}>
              <Text style={{
                fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
                color: view === v ? C.accent : C.textDim,
              }}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>◷</Text>
            <Text style={s.emptyTitle}>Loading...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>◷</Text>
            <Text style={s.emptyTitle}>No events {view === 'TODAY' ? 'today' : view === 'WEEK' ? 'this week' : 'found'}</Text>
            <Text style={s.emptySub}>Add events to your Sentralis-Data sheet</Text>
          </View>
        ) : view === 'TODAY' ? (
          // TODAY — flat timeline list
          <View style={s.timeline}>
            {filtered.map((ev, i) => (
              <TouchableOpacity key={ev.id || i} onPress={() => setSelectedEvent(ev)}>
                <View style={[s.timelineItem, { borderLeftColor: ev.contextColor }, ev.conflict && s.timelineItemConflict]}>
                  <View style={s.timeCol}>
                    <Text style={s.itemTime}>{formatTime(ev.time)}</Text>
                    <View style={[s.priorityDot, { backgroundColor: (PRIORITY_CONFIG[ev.priority] || PRIORITY_CONFIG.normal).color }]} />
                  </View>
                  <View style={s.itemBody}>
                    <View style={s.tagRow}>
                      <View style={[s.contextTag, { borderColor: ev.contextColor + '55', backgroundColor: ev.contextColor + '15' }]}>
                        <Text style={[s.contextTagText, { color: ev.contextColor }]}>{ev.context.toUpperCase()}</Text>
                      </View>
                      {ev.conflict && <View style={s.conflictTag}><Text style={s.conflictTagText}>⚠ CONFLICT</Text></View>}
                      {ev.needsApproval && <View style={s.approvalTag}><Text style={s.approvalTagText}>PENDING</Text></View>}
                    </View>
                    <Text style={s.itemTitle}>{ev.title}</Text>
                    {ev.detail ? <Text style={s.itemDetail} numberOfLines={2}>{ev.detail}</Text> : null}
                    {ev.location ? <Text style={s.itemLocation}>📍 {ev.location}</Text> : null}
                  </View>
                  <View style={[s.priorityStrip, { backgroundColor: (PRIORITY_CONFIG[ev.priority] || PRIORITY_CONFIG.normal).bg }]} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          // WEEK / ALL — grouped by date
          <View style={{ gap: 20 }}>
            {Object.keys(grouped).sort().map(date => (
              <View key={date}>
                {/* Date header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={{ height: 1, width: 12, backgroundColor: C.border }} />
                  <Text style={{ fontSize: 10, fontWeight: '800', color: date === today ? C.accent : C.textSub, letterSpacing: 1.5 }}>
                    {fmtDate(date)}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
                  <Text style={{ fontSize: 10, color: C.textDim }}>{grouped[date].length} event{grouped[date].length !== 1 ? 's' : ''}</Text>
                </View>
                {/* Events for that date */}
                <View style={s.timeline}>
                  {grouped[date].map((ev, i) => (
                    <TouchableOpacity key={ev.id || i} onPress={() => setSelectedEvent(ev)}>
                      <View style={[s.timelineItem, { borderLeftColor: ev.contextColor }, ev.conflict && s.timelineItemConflict]}>
                        <View style={s.timeCol}>
                          <Text style={s.itemTime}>{formatTime(ev.time)}</Text>
                          <View style={[s.priorityDot, { backgroundColor: (PRIORITY_CONFIG[ev.priority] || PRIORITY_CONFIG.normal).color }]} />
                        </View>
                        <View style={s.itemBody}>
                          <View style={s.tagRow}>
                            <View style={[s.contextTag, { borderColor: ev.contextColor + '55', backgroundColor: ev.contextColor + '15' }]}>
                              <Text style={[s.contextTagText, { color: ev.contextColor }]}>{ev.context.toUpperCase()}</Text>
                            </View>
                            {ev.conflict && <View style={s.conflictTag}><Text style={s.conflictTagText}>⚠ CONFLICT</Text></View>}
                          </View>
                          <Text style={s.itemTitle}>{ev.title}</Text>
                          {ev.location ? <Text style={s.itemLocation}>📍 {ev.location}</Text> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.taglineFooter}><Text style={s.taglineName}>SENTRALIS</Text><Text style={s.taglineText}>Where Everything Connects</Text></View>
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Event detail overlay */}
      {selectedEvent && (
        <TouchableOpacity style={s.detailOverlay} activeOpacity={1} onPress={() => setSelectedEvent(null)}>
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={s.detailCard}>
              <ScrollView>
                {/* Header */}
                <View style={[s.detailHeader, { marginBottom: 16 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={[s.contextTag, { borderColor: selectedEvent.contextColor + '55', backgroundColor: selectedEvent.contextColor + '15', alignSelf: 'flex-start', marginBottom: 8 }]}>
                      <Text style={[s.contextTagText, { color: selectedEvent.contextColor }]}>{selectedEvent.context.toUpperCase()}</Text>
                    </View>
                    <Text style={s.detailName}>{selectedEvent.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedEvent(null)} style={s.detailClose}>
                    <Text style={s.detailCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {[
                  { icon: '📅', label: 'DATE', value: fmtDate(selectedEvent.date) },
                  { icon: '◷', label: 'TIME', value: selectedEvent.time },
                  { icon: '📍', label: 'LOCATION', value: selectedEvent.location },
                  { icon: '📝', label: 'DETAIL', value: selectedEvent.detail },
                  { icon: '⚡', label: 'PRIORITY', value: (PRIORITY_CONFIG[selectedEvent.priority] || PRIORITY_CONFIG.normal).label },
                ].filter(r => r.value).map((row, i) => (
                  <View key={i} style={s.detailRow}>
                    <Text style={s.detailIcon}>{row.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailLabel}>{row.label}</Text>
                      <Text style={s.detailValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </View>
  );
}


// ─── STABLE INPUT — defined outside any component to prevent re-renders ────────
function StableInput({ onChangeText, placeholder, keyboardType, multiline, defaultValue }) {
  return (
    <TextInput
      defaultValue={defaultValue}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#666"
      keyboardType={keyboardType || 'default'}
      multiline={multiline}
      blurOnSubmit={false}
      style={{
        backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#2a2a4a',
        borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
        color: '#ffffff', fontSize: 14, minHeight: multiline ? 80 : undefined,
      }}
    />
  );
}

// ─── DRUM ROLL — smooth finger drag, tap center to type ───────────────────────
function DrumRoll({ items, selectedIndex, onSelect, itemHeight = 44, visibleCount = 5 }) {
  const paddingItems = Math.floor(visibleCount / 2);
  const containerHeight = itemHeight * visibleCount;

  // Animated offset — moves the list as finger drags
  const offset      = useRef(new Animated.Value(-selectedIndex * itemHeight)).current;
  const lastOffset  = useRef(-selectedIndex * itemHeight);
  const startY      = useRef(0);
  const isDragging  = useRef(false);

  const [editing, setEditing]   = useState(false);
  const [typeVal, setTypeVal]   = useState('');
  const inputRef                = useRef(null);

  // Sync when selectedIndex changes from outside
  useEffect(() => {
    const target = -selectedIndex * itemHeight;
    lastOffset.current = target;
    offset.setValue(target);
  }, [selectedIndex]);

  const clamp = (val) => Math.max(-(items.length - 1) * itemHeight, Math.min(0, val));

  const snapToIndex = (rawOffset) => {
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(-rawOffset / itemHeight)));
    const snapped = -idx * itemHeight;
    lastOffset.current = snapped;
    Animated.spring(offset, {
      toValue: snapped,
      useNativeDriver: true,
      tension: 120,
      friction: 10,
    }).start();
    onSelect(idx);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: (e) => {
        isDragging.current = false;
        startY.current = e.nativeEvent.pageY;
        offset.stopAnimation((v) => { lastOffset.current = v; });
      },
      onPanResponderMove: (e) => {
        const dy = e.nativeEvent.pageY - startY.current;
        if (Math.abs(dy) > 4) isDragging.current = true;
        offset.setValue(clamp(lastOffset.current + dy));
      },
      onPanResponderRelease: (e) => {
        const dy = e.nativeEvent.pageY - startY.current;
        if (!isDragging.current) {
          // It was a tap — find which item was tapped
          const tapY    = e.nativeEvent.locationY;
          const tappedIdx = Math.floor(tapY / itemHeight);
          const realIdx   = tappedIdx - paddingItems;
          const currentIdx = Math.round(-lastOffset.current / itemHeight);
          if (realIdx === currentIdx) {
            // Tapped the center selected item → open keyboard
            setTypeVal(items[currentIdx] || '');
            setEditing(true);
            setTimeout(() => inputRef.current?.focus(), 50);
          } else if (realIdx >= 0 && realIdx < items.length) {
            // Tapped a non-center item → scroll to it
            snapToIndex(-realIdx * itemHeight);
          }
        } else {
          snapToIndex(clamp(lastOffset.current + dy));
        }
      },
      onPanResponderTerminate: (e, g) => {
        snapToIndex(clamp(lastOffset.current + g.dy));
      },
    })
  ).current;

  const handleTypeSubmit = () => {
    const val = typeVal.trim();
    const idx = items.indexOf(val);
    if (idx >= 0) {
      snapToIndex(-idx * itemHeight);
    }
    setEditing(false);
  };

  // Build the list of all items (with padding top/bottom so selection stays centered)
  const allItems = [
    ...Array(paddingItems).fill(''),
    ...items,
    ...Array(paddingItems).fill(''),
  ];

  return (
    <View style={{ height: containerHeight, overflow: 'hidden' }}>
      {/* Center highlight band */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: itemHeight * paddingItems,
        left: 0, right: 0,
        height: itemHeight,
        backgroundColor: C.accent + '20',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: C.accent + '55',
        zIndex: 2,
      }} />

      {/* Keyboard input overlay — shown when center is tapped */}
      {editing && (
        <View style={{
          position: 'absolute',
          top: itemHeight * paddingItems,
          left: 0, right: 0,
          height: itemHeight,
          zIndex: 10,
          backgroundColor: C.bgCard,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: C.accent,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <TextInput
            ref={inputRef}
            value={typeVal}
            onChangeText={setTypeVal}
            onSubmitEditing={handleTypeSubmit}
            onBlur={handleTypeSubmit}
            returnKeyType="done"
            selectTextOnFocus
            style={{
              width: '100%',
              textAlign: 'center',
              fontSize: 20,
              fontWeight: '800',
              color: C.accent,
              paddingHorizontal: 4,
            }}
          />
        </View>
      )}

      {/* Draggable list */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateY: offset }] }}
      >
        {allItems.map((item, i) => {
          const realIdx  = i - paddingItems;
          const isSelected = realIdx === selectedIndex;
          return (
            <View
              key={i}
              style={{ height: itemHeight, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{
                fontSize:   isSelected ? 20 : 14,
                fontWeight: isSelected ? '800' : '400',
                color:      isSelected ? C.text : C.textDim,
              }}>
                {item}
              </Text>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── DATE INPUT — drum roll picker, no buttons ─────────────────────────────────
function DateInput({ valueRef }) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS   = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  const currentYear = new Date().getFullYear();
  const YEARS  = Array.from({ length: 5 }, (_, i) => String(currentYear + i - 1));

  const parseISO = (s) => {
    const d = new Date((s || SheetsService.getTodayString()) + 'T00:00:00');
    return isNaN(d) ? new Date() : d;
  };
  const init = parseISO(valueRef.current);
  const [dayIdx,   setDayIdx]   = useState(init.getDate() - 1);
  const [monthIdx, setMonthIdx] = useState(init.getMonth());
  const [yearIdx,  setYearIdx]  = useState(Math.max(0, init.getFullYear() - (currentYear - 1)));

  const commit = (d, mo, y) => {
    const iso = `${YEARS[Math.min(y, YEARS.length-1)]}-${String(mo+1).padStart(2,'0')}-${String(d+1).padStart(2,'0')}`;
    valueRef.current = iso;
  };

  const handleDay   = (i) => { setDayIdx(i);   commit(i, monthIdx, yearIdx); };
  const handleMonth = (i) => { setMonthIdx(i); commit(dayIdx, i, yearIdx); };
  const handleYear  = (i) => { setYearIdx(i);  commit(dayIdx, monthIdx, i); };

  const label = `${DAYS[dayIdx]} ${MONTHS[monthIdx]} ${YEARS[Math.min(yearIdx, YEARS.length-1)]}`;

  return (
    <View style={{ backgroundColor: C.bgCardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' }}>
      <View style={{ paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent, letterSpacing: 0.5 }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: C.border }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: C.textDim, textAlign: 'center', paddingTop: 4, letterSpacing: 1 }}>DAY</Text>
          <DrumRoll items={DAYS}   selectedIndex={dayIdx}   onSelect={handleDay}   itemHeight={40} visibleCount={5} />
        </View>
        <View style={{ flex: 1.3, borderRightWidth: 1, borderRightColor: C.border }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: C.textDim, textAlign: 'center', paddingTop: 4, letterSpacing: 1 }}>MONTH</Text>
          <DrumRoll items={MONTHS} selectedIndex={monthIdx} onSelect={handleMonth} itemHeight={40} visibleCount={5} />
        </View>
        <View style={{ flex: 1.2 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: C.textDim, textAlign: 'center', paddingTop: 4, letterSpacing: 1 }}>YEAR</Text>
          <DrumRoll items={YEARS}  selectedIndex={yearIdx}  onSelect={handleYear}  itemHeight={40} visibleCount={5} />
        </View>
      </View>
    </View>
  );
}

// ─── TIME INPUT — drum roll picker, no buttons ─────────────────────────────────
function TimeInput({ valueRef }) {
  const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const AMPMS   = ['AM', 'PM'];

  const parse = (s) => {
    const [h, m] = (s || '09:00').split(':').map(Number);
    return { h: isNaN(h) ? 9 : h, m: isNaN(m) ? 0 : m };
  };
  const init    = parse(valueRef.current);
  const initH12 = init.h % 12 || 12;
  const [hourIdx,   setHourIdx]   = useState(initH12 - 1);
  const [minuteIdx, setMinuteIdx] = useState(init.m);
  const [ampmIdx,   setAmpmIdx]   = useState(init.h >= 12 ? 1 : 0);

  const commit = (hi, mi, ai) => {
    let h24 = (hi + 1) % 12;
    if (ai === 1) h24 += 12;
    valueRef.current = `${String(h24).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;
  };

  const handleHour   = (i) => { setHourIdx(i);   commit(i, minuteIdx, ampmIdx); };
  const handleMinute = (i) => { setMinuteIdx(i); commit(hourIdx, i, ampmIdx); };
  const handleAMPM   = (i) => { setAmpmIdx(i);   commit(hourIdx, minuteIdx, i); };

  const label = `${HOURS[hourIdx]}:${MINUTES[minuteIdx]} ${AMPMS[ampmIdx]}`;

  return (
    <View style={{ backgroundColor: C.bgCardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' }}>
      <View style={{ paddingVertical: 6, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent, letterSpacing: 0.5 }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: C.border }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: C.textDim, textAlign: 'center', paddingTop: 4, letterSpacing: 1 }}>HOUR</Text>
          <DrumRoll items={HOURS}   selectedIndex={hourIdx}   onSelect={handleHour}   itemHeight={40} visibleCount={5} />
        </View>
        <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: C.border }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: C.textDim, textAlign: 'center', paddingTop: 4, letterSpacing: 1 }}>MIN</Text>
          <DrumRoll items={MINUTES} selectedIndex={minuteIdx} onSelect={handleMinute} itemHeight={40} visibleCount={5} />
        </View>
        <View style={{ flex: 0.8 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: C.textDim, textAlign: 'center', paddingTop: 4, letterSpacing: 1 }}>AM/PM</Text>
          <DrumRoll items={AMPMS}   selectedIndex={ampmIdx}   onSelect={handleAMPM}   itemHeight={40} visibleCount={5} />
        </View>
      </View>
    </View>
  );
}

// ─── MORE SCREEN ──────────────────────────────────────────────────────────────
function MoreScreen() {
  const [section, setSection] = useState(null); // null | 'addTask' | 'addEvent' | 'addMoney'
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState(null);

  // Quick Add Task — refs for text (no re-render on type), state for chips
  const taskTitleRef    = useRef('');
  const taskDueRef      = useRef(SheetsService.getTodayString());
  const [taskContext, setTaskContext]     = useState('Church');
  const [taskPriority, setTaskPriority]   = useState('normal');

  // Quick Add Event — refs for text
  const evtTitleRef    = useRef('');
  const evtDateRef     = useRef(SheetsService.getTodayString());
  const evtTimeRef     = useRef('09:00');
  const evtLocationRef = useRef('');
  const [evtContext, setEvtContext]       = useState('Church');

  // Quick Add Money — refs for text
  const monAmountRef   = useRef('');
  const monCategoryRef = useRef('');
  const monDescRef     = useRef('');
  const [monType, setMonType]             = useState('expense');
  const [monContext, setMonContext]       = useState('Church');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const CONTEXTS = ['Family', 'Church', 'Mayor', 'MCPro', 'Hardware', 'Foundation', 'Printing'];
  const PRIORITIES = ['normal', 'important', 'critical', 'light'];

  const saveTask = async () => {
    if (!taskTitleRef.current.trim()) { showToast('Please enter a task title'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitleRef.current.trim(),
          context: taskContext,
          priority: taskPriority,
          dueDate: taskDueRef.current,
          assignedTo: 'Rey',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Task added to your sheet!');
        taskTitleRef.current = ''; setSection(null);
      } else {
        showToast('❌ Error: ' + data.error);
      }
    } catch (e) {
      showToast('❌ Connection error');
    } finally {
      setSaving(false);
    }
  };

  const saveEvent = async () => {
    if (!evtTitleRef.current.trim()) { showToast('Please enter an event title'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: evtTitleRef.current.trim(),
          context: evtContext,
          date: evtDateRef.current,
          time: evtTimeRef.current,
          location: evtLocationRef.current.trim(),
          priority: 'normal',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Event added to your sheet!');
        evtTitleRef.current = ''; evtLocationRef.current = ''; setSection(null);
      } else {
        showToast('❌ Error: ' + data.error);
      }
    } catch (e) {
      showToast('❌ Connection error');
    } finally {
      setSaving(false);
    }
  };

  const saveMoney = async () => {
    if (!monAmountRef.current || isNaN(parseFloat(monAmountRef.current))) { showToast('Please enter a valid amount'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${CONFIG.BACKEND_URL}/api/money`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: monType,
          amount: parseFloat(monAmountRef.current),
          currency: 'PHP',
          context: monContext,
          category: monCategoryRef.current.trim(),
          description: monDescRef.current.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Record added to your sheet!');
        monAmountRef.current = ''; monCategoryRef.current = ''; monDescRef.current = ''; setSection(null);
      } else {
        showToast('❌ Error: ' + data.error);
      }
    } catch (e) {
      showToast('❌ Connection error');
    } finally {
      setSaving(false);
    }
  };

  const Chip = ({ label, active, onPress, color }) => (
    <TouchableOpacity onPress={onPress} style={{
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1,
      borderColor: active ? (color || C.accent) : C.border,
      backgroundColor: active ? (color || C.accent) + '22' : C.bgCard,
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? (color || C.accent) : C.textDim }}>{label}</Text>
    </TouchableOpacity>
  );

  const Field = ({ label, children }) => (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: C.textDim, letterSpacing: 1, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );

  const Input = ({ value, onChangeText, placeholder, keyboardType }) => (
    <View style={{ backgroundColor: C.bgCardAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
      <Text
        style={{ color: value ? C.text : C.textDim, fontSize: 14 }}
        onPress={() => {}}
      >{value || placeholder}</Text>
    </View>
  );

  // StableInput is defined outside this component

  const MENU_ITEMS = [
    { id: 'addTask',  icon: '◻', label: 'Add Task',    sub: 'Quick add to your Tasks sheet',  color: C.accent },
    { id: 'addEvent', icon: '◷', label: 'Add Event',   sub: 'Quick add to your Events sheet', color: '#F5C842' },
    { id: 'addMoney', icon: '◈', label: 'Add Money',   sub: 'Log income or expense',          color: '#4ADE80' },
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
        <View style={s.screenHeader}>
          <Text style={s.screenTitle}>More</Text>
          <Text style={s.screenSub}>Quick actions & tools</Text>
        </View>

        {/* Menu */}
        {!section && (
          <View style={{ gap: 10, marginTop: 8 }}>
            {MENU_ITEMS.map(item => (
              <TouchableOpacity key={item.id} onPress={() => setSection(item.id)}
                style={{ backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: 14, borderLeftWidth: 3, borderLeftColor: item.color, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Text style={{ fontSize: 24, color: item.color }}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{item.label}</Text>
                  <Text style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{item.sub}</Text>
                </View>
                <Text style={{ fontSize: 18, color: C.textDim }}>›</Text>
              </TouchableOpacity>
            ))}

            {/* Info section */}
            <View style={{ marginTop: 16, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, gap: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: C.textDim, letterSpacing: 1.5 }}>SYSTEM INFO</Text>
              {[
                { label: 'App Version', value: 'v0.5 · Session 017' },
                { label: 'Backend',     value: 'Railway · Online' },
                { label: 'Data Source', value: 'Google Sheets' },
                { label: 'Built by',    value: 'Rey & Claude · MCPro' },
              ].map((row, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: C.border }}>
                  <Text style={{ fontSize: 12, color: C.textDim }}>{row.label}</Text>
                  <Text style={{ fontSize: 12, color: C.text, fontWeight: '600' }}>{row.value}</Text>
                </View>
              ))}
            </View>

            <View style={s.taglineFooter}><Text style={s.taglineName}>SENTRALIS</Text><Text style={s.taglineText}>Where Everything Connects</Text></View>
          </View>
        )}

        {/* ADD TASK FORM */}
        {section === 'addTask' && (
          <View style={{ gap: 4 }}>
            <TouchableOpacity onPress={() => setSection(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, color: C.accent }}>‹</Text>
              <Text style={{ fontSize: 13, color: C.accent, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 20 }}>Add Task</Text>

            <Field label="TITLE">
              <StableInput defaultValue={taskTitleRef.current} onChangeText={v => taskTitleRef.current = v} placeholder="What needs to be done?" />
            </Field>

            <Field label="CONTEXT">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CONTEXTS.map(c => (
                  <Chip key={c} label={c} active={taskContext === c} onPress={() => setTaskContext(c)} color={CONTEXT_COLORS[c]} />
                ))}
              </View>
            </Field>

            <Field label="PRIORITY">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PRIORITIES.map(p => (
                  <Chip key={p} label={p.toUpperCase()} active={taskPriority === p} onPress={() => setTaskPriority(p)} color={(PRIORITY_CONFIG[p] || PRIORITY_CONFIG.normal).color} />
                ))}
              </View>
            </Field>

            <Field label="DUE DATE">
              <DateInput valueRef={taskDueRef} />
            </Field>

            <TouchableOpacity onPress={saveTask} disabled={saving}
              style={{ backgroundColor: C.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.bg, letterSpacing: 0.5 }}>{saving ? 'Saving...' : 'ADD TASK'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ADD EVENT FORM */}
        {section === 'addEvent' && (
          <View style={{ gap: 4 }}>
            <TouchableOpacity onPress={() => setSection(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, color: C.accent }}>‹</Text>
              <Text style={{ fontSize: 13, color: C.accent, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 20 }}>Add Event</Text>

            <Field label="TITLE">
              <StableInput defaultValue={evtTitleRef.current} onChangeText={v => evtTitleRef.current = v} placeholder="Event name" />
            </Field>

            <Field label="CONTEXT">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CONTEXTS.map(c => (
                  <Chip key={c} label={c} active={evtContext === c} onPress={() => setEvtContext(c)} color={CONTEXT_COLORS[c]} />
                ))}
              </View>
            </Field>

            <Field label="DATE">
              <DateInput valueRef={evtDateRef} />
            </Field>

            <Field label="TIME">
              <TimeInput valueRef={evtTimeRef} />
            </Field>

            <Field label="LOCATION (OPTIONAL)">
              <StableInput defaultValue={evtLocationRef.current} onChangeText={v => evtLocationRef.current = v} placeholder="Where?" />
            </Field>

            <TouchableOpacity onPress={saveEvent} disabled={saving}
              style={{ backgroundColor: '#F5C842', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.bg, letterSpacing: 0.5 }}>{saving ? 'Saving...' : 'ADD EVENT'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ADD MONEY FORM */}
        {section === 'addMoney' && (
          <View style={{ gap: 4 }}>
            <TouchableOpacity onPress={() => setSection(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <Text style={{ fontSize: 16, color: C.accent }}>‹</Text>
              <Text style={{ fontSize: 13, color: C.accent, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, marginBottom: 20 }}>Log Money</Text>

            <Field label="TYPE">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['income', 'expense', 'transfer'].map(t => (
                  <Chip key={t} label={t.toUpperCase()} active={monType === t}
                    onPress={() => setMonType(t)}
                    color={t === 'income' ? C.light : t === 'expense' ? C.critical : C.accent} />
                ))}
              </View>
            </Field>

            <Field label="AMOUNT (PHP)">
              <StableInput defaultValue={monAmountRef.current} onChangeText={v => monAmountRef.current = v} placeholder="0.00" keyboardType="numeric" />
            </Field>

            <Field label="CONTEXT">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CONTEXTS.map(c => (
                  <Chip key={c} label={c} active={monContext === c} onPress={() => setMonContext(c)} color={CONTEXT_COLORS[c]} />
                ))}
              </View>
            </Field>

            <Field label="CATEGORY (OPTIONAL)">
              <StableInput defaultValue={monCategoryRef.current} onChangeText={v => monCategoryRef.current = v} placeholder="e.g. Salary, Food, Transport" />
            </Field>

            <Field label="DESCRIPTION">
              <StableInput defaultValue={monDescRef.current} onChangeText={v => monDescRef.current = v} placeholder="What is this for?" multiline />
            </Field>

            <TouchableOpacity onPress={saveMoney} disabled={saving}
              style={{ backgroundColor: C.light, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: C.bg, letterSpacing: 0.5 }}>{saving ? 'Saving...' : 'LOG MONEY'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Toast notification */}
      {toast && (
        <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.accent + '55', borderRadius: 12, padding: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>{toast}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function PlaceholderScreen({ label }) {
  return (
    <View style={s.placeholder}>
      <Text style={s.placeholderIcon}>◈</Text>
      <Text style={s.placeholderTitle}>{label}</Text>
      <Text style={s.placeholderSub}>Coming in next session</Text>
      <View style={s.placeholderTagline}>
        <Text style={s.taglineName}>SENTRALIS</Text>
        <Text style={s.taglineText}>Where Everything Connects</Text>
      </View>
    </View>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('command');
  const [taskCount, setTaskCount] = useState(0);

  // ── Init SQLite + clean bad items + background sync every 60 seconds ─────────
  useEffect(() => {
    OfflineQueue.init().then(async () => {
      // One-time cleanup: remove invalid 'error' type items from old builds
      try {
        await OfflineQueue.db.runAsync("DELETE FROM queue WHERE type = 'error'");
        console.log('[QUEUE] Cleaned up error-type items');
      } catch (e) {}
      OfflineQueue.syncAll();
    });
    const syncInterval = setInterval(() => OfflineQueue.syncAll(), 60000);
    return () => clearInterval(syncInterval);
  }, []);

  // ── Register device for push notifications ──────────────────────────────────
  useEffect(() => {
    (async () => {
      if (!Device.isDevice) return;
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      let token = null;
      try {
        const pushToken = await Notifications.getExpoPushTokenAsync({
          projectId: '575623ad-e4fe-48aa-9250-9249d9466807',
        });
        token = pushToken.data;
      } catch (err) {
        // Push notifications not available — skip silently
        // Fix in Session 016: update EAS CLI then run eas credentials FCM V1
        console.log('[PUSH] Token error (will fix in S016):', err.message);
        return;
      }
      if (!token) return;
      await fetch(`${CONFIG.BACKEND_URL}/api/device/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, device: 'Samsung A34', tokenType: 'expo' }),
      }).catch(() => {});
    })();
  }, []);

  useEffect(() => {
    if (!CONFIG.API_KEY) return;
    SheetsService.fetchAllTasks()
      .then(tasks => setTaskCount(tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length))
      .catch(() => {});
  }, []);

  const renderScreen = () => {
    switch (activeTab) {
      case 'command': return <CommandScreen />;
      case 'tasks':   return <TasksScreen />;
      case 'people':  return <PeopleScreen />;
      case 'money':   return <MoneyScreen />;
      case 'time':    return <TimeScreen />;
      case 'more':    return <MoreScreen />;
      default: return <PlaceholderScreen label={NAV_TABS.find(t => t.id === activeTab)?.label || ''} />;
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <View style={{ flex: 1 }}>{renderScreen()}</View>
      <View style={s.navBar}>
        {NAV_TABS.map(tab => {
          const active = activeTab === tab.id;
          const showBadge = tab.id === 'tasks' && taskCount > 0 && !active;
          return (
            <TouchableOpacity key={tab.id} style={s.navTab} onPress={() => setActiveTab(tab.id)} activeOpacity={0.7}>
              {active && <View style={s.navActiveLine} />}
              <View style={s.navIconWrap}>
                <Text style={[s.navIcon, active && s.navIconActive]}>{tab.icon}</Text>
                {showBadge && <View style={s.navBadge}><Text style={s.navBadgeText}>{taskCount}</Text></View>}
              </View>
              <Text style={[s.navLabel, active && s.navLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  screen: { flex: 1, backgroundColor: C.bg },
  screenContent: { paddingHorizontal: 16, paddingTop: 16 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  greeting: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  dateLabel: { fontSize: 11, color: C.textSub, marginTop: 2, letterSpacing: 0.3 },
  voiceBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accent + '55', alignItems: 'center', justifyContent: 'center' },
  voiceBtnIcon: { fontSize: 18, color: C.accent },

  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.light },
  liveText: { fontSize: 9, color: C.light, fontWeight: '700', letterSpacing: 1 },

  aiStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14, gap: 10 },
  aiIcon: { fontSize: 14, color: C.accent },
  aiText: { flex: 1, fontSize: 12, color: C.textSub, lineHeight: 17 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 10, alignItems: 'center', gap: 2 },
  statCardAlert: { borderColor: C.critical + '55', backgroundColor: C.criticalBg },
  statCardGood:  { borderColor: C.light + '33' },
  statIcon:  { fontSize: 12, color: C.accent },
  statValue: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: C.textDim, letterSpacing: 0.5, textTransform: 'uppercase' },

  conflictBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#180808', borderWidth: 1, borderColor: C.critical + '66', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 },
  conflictLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  conflictIcon: { fontSize: 18, color: C.critical },
  conflictTitle: { fontSize: 10, fontWeight: '700', color: C.critical, letterSpacing: 1 },
  conflictSub: { fontSize: 11, color: C.textSub, marginTop: 1 },
  conflictActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  conflictBtn: { backgroundColor: C.critical, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  conflictBtnText: { fontSize: 10, fontWeight: '700', color: '#FFF', letterSpacing: 1 },
  conflictDismiss: { fontSize: 14, color: C.textDim },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.text, letterSpacing: 1.5 },
  sectionSub: { fontSize: 9, color: C.textDim, letterSpacing: 0.5 },

  legendRow: { flexDirection: 'row', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 0.5 },

  timeline: { gap: 8 },
  timelineItem: { flexDirection: 'row', backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, overflow: 'hidden' },
  timelineItemConflict: { borderColor: C.critical + '55', backgroundColor: '#120C0C' },
  timeCol: { width: 52, paddingVertical: 12, paddingLeft: 10, alignItems: 'center', gap: 6, borderRightWidth: 1, borderRightColor: C.border },
  itemTime: { fontSize: 11, fontWeight: '700', color: C.textSub, letterSpacing: 0.3 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  itemBody: { flex: 1, padding: 12, gap: 5 },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  contextTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  contextTagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  conflictTag: { backgroundColor: C.critical + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  conflictTagText: { fontSize: 9, fontWeight: '700', color: C.critical, letterSpacing: 0.5 },
  approvalTag: { backgroundColor: C.important + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  approvalTagText: { fontSize: 9, fontWeight: '700', color: C.important, letterSpacing: 0.5 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 20, flexShrink: 1 },
  itemDetail: { fontSize: 11, color: C.textSub, lineHeight: 16 },
  itemLocation: { fontSize: 10, color: C.textDim, lineHeight: 15 },
  approvalRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  approveBtn: { backgroundColor: C.light + '22', borderWidth: 1, borderColor: C.light + '55', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  approveBtnText: { fontSize: 10, fontWeight: '700', color: C.light, letterSpacing: 0.5 },
  denyBtn: { backgroundColor: C.critical + '11', borderWidth: 1, borderColor: C.critical + '44', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  denyBtnText: { fontSize: 10, fontWeight: '700', color: C.critical, letterSpacing: 0.5 },
  priorityStrip: { width: 6, alignItems: 'center', justifyContent: 'center', borderTopRightRadius: 12, borderBottomRightRadius: 12 },

  filterScroll: { marginBottom: 14 },
  filterRow: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  filterBtnText: { fontSize: 10, fontWeight: '700', color: C.textDim, letterSpacing: 0.8 },
  filterBtnTextActive: { color: C.accent },

  taskList: { gap: 8 },
  taskCard: { flexDirection: 'row', backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, overflow: 'hidden' },
  taskCardOverdue: { borderColor: C.critical + '55', backgroundColor: '#120C0C' },
  taskCardDone: { opacity: 0.6 },
  taskCheckbox: { width: 52, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.border },
  checkboxInner: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.textDim, alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: C.light, borderColor: C.light },
  checkboxTick: { fontSize: 13, color: '#000', fontWeight: '900' },
  taskBody: { flex: 1, padding: 12, gap: 5 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: C.text, lineHeight: 19 },
  taskTitleDone: { textDecorationLine: 'line-through', color: C.textDim },
  taskDetail: { fontSize: 11, color: C.textSub, lineHeight: 16 },
  taskMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginTop: 2 },
  taskDue: { fontSize: 10, color: C.textDim },
  taskAssigned: { fontSize: 10, color: C.textDim },
  overdueTag: { backgroundColor: C.critical + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  overdueTagText: { fontSize: 9, fontWeight: '700', color: C.critical, letterSpacing: 0.5 },
  dueTodayTag: { backgroundColor: C.important + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  dueTodayTagText: { fontSize: 9, fontWeight: '700', color: C.important, letterSpacing: 0.5 },
  doneTag: { backgroundColor: C.light + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  doneTagText: { fontSize: 9, fontWeight: '700', color: C.light, letterSpacing: 0.5 },
  hintBanner: { backgroundColor: C.accentSoft, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  hintText: { fontSize: 10, color: C.accent, letterSpacing: 0.3 },
  writebackNote: { marginTop: 16, paddingHorizontal: 4 },
  writebackText: { fontSize: 9, color: C.textDim, textAlign: 'center', lineHeight: 14 },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  loadingIcon: { fontSize: 40, color: C.accent },
  loadingText: { fontSize: 11, fontWeight: '700', color: C.textSub, letterSpacing: 2 },
  loadingSubText: { fontSize: 11, color: C.textDim },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyIcon: { fontSize: 32, color: C.textDim },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.textSub },
  emptySub: { fontSize: 11, color: C.textDim, textAlign: 'center', paddingHorizontal: 20 },

  taglineFooter: { alignItems: 'center', paddingVertical: 24, gap: 2 },
  placeholderTagline: { alignItems: 'center', marginTop: 16, gap: 2 },
  taglineName: { fontSize: 10, fontWeight: '900', color: C.textDim, letterSpacing: 4 },
  taglineText: { fontSize: 11, color: C.textDim, letterSpacing: 1, fontStyle: 'italic' },

  navBar: { flexDirection: 'row', backgroundColor: C.navBg, borderTopWidth: 1, borderTopColor: C.navBorder, paddingBottom: Platform.OS === 'ios' ? 20 : 36, paddingTop: 8 },
  navTab: { flex: 1, alignItems: 'center', gap: 3, position: 'relative', paddingBottom: 2 },
  navActiveLine: { position: 'absolute', top: -8, width: 24, height: 2, backgroundColor: C.accent, borderRadius: 1 },
  navIconWrap: { position: 'relative' },
  navIcon: { fontSize: 16, color: C.textDim },
  navIconActive: { color: C.accent },
  navLabel: { fontSize: 9, color: C.textDim, letterSpacing: 0.3 },
  navLabelActive: { color: C.accent, fontWeight: '600' },
  navBadge: { position: 'absolute', top: -5, right: -8, backgroundColor: C.critical, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  navBadgeText: { fontSize: 8, fontWeight: '900', color: '#FFF' },

  // People
  personCard: { flexDirection: 'row', backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8, alignItems: 'center', gap: 12 },
  personAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  personInitials: { fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  personInfo: { flex: 1, gap: 4 },
  personName: { fontSize: 15, fontWeight: '700', color: C.text },
  personRole: { fontSize: 11, color: C.textSub },
  personMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  personMetaText: { fontSize: 10, color: C.textDim },
  personNotes: { fontSize: 10, color: C.textDim, fontStyle: 'italic', marginTop: 2 },
  personArrow: { fontSize: 22, color: C.textDim, paddingLeft: 4 },
  criticalTag: { backgroundColor: C.normal + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  criticalTagText: { fontSize: 9, fontWeight: '700', color: C.normal, letterSpacing: 0.5 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 4 },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  groupCount: { fontSize: 10, color: C.textDim, marginLeft: 2 },
  detailOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  detailCard: { backgroundColor: C.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.border, padding: 20, maxHeight: '85%' },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  detailAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  detailInitials: { fontSize: 22, fontWeight: '900' },
  detailName: { fontSize: 20, fontWeight: '700', color: C.text },
  detailNickname: { fontSize: 12, color: C.textSub, fontStyle: 'italic' },
  detailClose: { padding: 4 },
  detailCloseText: { fontSize: 18, color: C.textDim },
  detailRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'flex-start' },
  detailIcon: { fontSize: 16, width: 24 },
  detailLabel: { fontSize: 9, color: C.textDim, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  detailValue: { fontSize: 13, color: C.text },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 8 },
  detailActionBtn: { flex: 1, backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accent + '55', borderRadius: 10, paddingVertical: 12, alignItems: 'center', gap: 4 },
  detailActionIcon: { fontSize: 18 },
  detailActionText: { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 0.5 },

  // Dashboard cards
  dashCard: { flex: 1, backgroundColor: C.bgCard, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, padding: 12, gap: 2, minHeight: 80 },
  dashCardIcon: { fontSize: 11, color: C.textDim },
  dashCardValue: { fontSize: 20, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  dashCardLabel: { fontSize: 9, color: C.textDim, letterSpacing: 0.5, textTransform: 'uppercase' },
  dashCardAlert: { marginTop: 4, backgroundColor: C.importantBg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  dashCardAlertText: { fontSize: 8, fontWeight: '700', color: C.important, letterSpacing: 0.3 },
  dashTaskRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: C.bgCard, borderRadius: 10, borderWidth: 1, borderColor: C.border, borderLeftWidth: 3, padding: 10, gap: 10 },
  dashTaskTitle: { fontSize: 13, fontWeight: '600', color: C.text, lineHeight: 18 },
  dashTaskMeta: { fontSize: 9, color: C.textDim, fontWeight: '600', letterSpacing: 0.3 },

  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  placeholderIcon: { fontSize: 40, color: C.textDim },
  placeholderTitle: { fontSize: 22, fontWeight: '700', color: C.textSub, letterSpacing: -0.5 },
  placeholderSub: { fontSize: 12, color: C.textDim },

  // Voice Assistant
  voiceOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'flex-end', zIndex: 100 },
  voiceCard: { backgroundColor: C.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: C.border, padding: 24, paddingBottom: 40, minHeight: 360 },
  voiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  voiceTitle: { fontSize: 11, fontWeight: '800', color: C.accent, letterSpacing: 2 },
  voiceCloseBtn: { padding: 4 },
  voiceCloseText: { fontSize: 18, color: C.textDim },
  voiceStatus: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 20, textAlign: 'center' },
  voiceTranscript: { backgroundColor: C.bgCardAlt, borderRadius: 12, padding: 14, marginBottom: 10 },
  voiceTranscriptLabel: { fontSize: 9, fontWeight: '700', color: C.textDim, letterSpacing: 1.5, marginBottom: 4 },
  voiceTranscriptText: { fontSize: 14, color: C.text, lineHeight: 20 },
  voiceReply: { backgroundColor: C.accentSoft, borderRadius: 12, borderWidth: 1, borderColor: C.accent + '44', padding: 14, marginBottom: 10 },
  voiceReplyLabel: { fontSize: 9, fontWeight: '700', color: C.accent, letterSpacing: 1.5, marginBottom: 4 },
  voiceReplyText: { fontSize: 14, color: C.text, lineHeight: 20 },
  voiceError: { fontSize: 12, color: C.critical, textAlign: 'center', marginBottom: 10 },
  voiceMicWrap: { alignItems: 'center', marginVertical: 20 },
  voiceMicRing: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  voiceMicBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  voiceMicIcon: { fontSize: 30 },
  voiceHint: { fontSize: 10, color: C.textDim, textAlign: 'center', letterSpacing: 0.3 },

  // Screen headers (Money, Time, More)
  screenHeader: { marginBottom: 12 },
  screenTitle: { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  screenSub: { fontSize: 11, color: C.textSub, marginTop: 2 },

  // Filter tabs (Money screen)
  filterTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.bgCard, borderWidth: 1, borderColor: C.border },
  filterTabActive: { backgroundColor: C.accentSoft, borderColor: C.accent },
  filterTabText: { fontSize: 10, fontWeight: '700', color: C.textDim, letterSpacing: 0.8 },
  filterTabTextActive: { color: C.accent },
});
