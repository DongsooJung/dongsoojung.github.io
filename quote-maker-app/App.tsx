import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';

type LineItem = { id: string; name: string; qty: string; price: string };
type VatMode = 'separate' | 'include' | 'none';

const FREE_DAILY = 3;
const STORAGE_PLAN = 'quote-maker-plan-v1';
const STORAGE_USAGE = 'quote-maker-usage-v1';
const STORAGE_LOGO = 'quote-maker-logo-v1';
const DEMO_KEY = 'HQ-DEMO-PRO-2026';
const PAY_URL = 'https://gumroad.com/l/hello';

const colors = {
  bg: '#0a0d14',
  panel: '#0f172a',
  panel2: '#111c33',
  line: '#1f2a44',
  line2: '#263452',
  ink: '#e6edf3',
  sub: '#9aa7b8',
  muted: '#6b7a90',
  acc: '#7aa2ff',
  warm: '#ffb86b',
  good: '#63d6a0',
  danger: '#ff7a8a',
  paper: '#f7f4ee',
  paperInk: '#1a1f2b',
  paperMuted: '#5c6475',
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(n: number) {
  return '₩' + Math.round(n).toLocaleString('ko-KR');
}

function defaultQuoteNo() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `Q-${stamp}-${String(Math.floor(Math.random() * 900) + 100)}`;
}

function verifyKey(key: string) {
  const m = /^HQ-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/.exec(key);
  if (!m) return false;
  const body = (m[1] + m[2]).toUpperCase();
  let h = 0;
  for (let i = 0; i < body.length; i++) h = ((h << 5) - h + body.charCodeAt(i)) | 0;
  const expect = (Math.abs(h).toString(16).toUpperCase() + 'AAAA').slice(0, 4);
  return m[3] === expect;
}

function newItem(partial?: Partial<LineItem>): LineItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: partial?.name ?? '',
    qty: partial?.qty ?? '1',
    price: partial?.price ?? '0',
  };
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function App() {
  const [sellerName, setSellerName] = useState('Stargate Studio');
  const [sellerContact, setSellerContact] = useState('010-0000-0000');
  const [sellerEmail, setSellerEmail] = useState('hello@stargateedu.co.kr');
  const [sellerBiz, setSellerBiz] = useState('');
  const [clientName, setClientName] = useState('홍길동 고객님');
  const [quoteNo, setQuoteNo] = useState(defaultQuoteNo);
  const [quoteDate, setQuoteDate] = useState(todayKey());
  const [validDays, setValidDays] = useState('14');
  const [vatMode, setVatMode] = useState<VatMode>('separate');
  const [notes, setNotes] = useState('· 본 견적은 발행일로부터 유효합니다.\n· 작업 범위 변경 시 금액이 조정될 수 있습니다.');
  const [items, setItems] = useState<LineItem[]>([
    newItem({ name: '웹사이트 랜딩 페이지 제작', qty: '1', price: '500000' }),
    newItem({ name: '모바일 반응형 최적화', qty: '1', price: '150000' }),
    newItem({ name: '수정 라운드 (2회)', qty: '1', price: '80000' }),
  ]);
  const [isPro, setIsPro] = useState(false);
  const [usageCount, setUsageCount] = useState(0);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [proOpen, setProOpen] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const plan = await AsyncStorage.getItem(STORAGE_PLAN);
        setIsPro(plan === 'pro');
        const raw = await AsyncStorage.getItem(STORAGE_USAGE);
        if (raw) {
          const parsed = JSON.parse(raw) as { date?: string; count?: number };
          setUsageCount(parsed.date === todayKey() ? Number(parsed.count) || 0 : 0);
        }
        const logo = await AsyncStorage.getItem(STORAGE_LOGO);
        if (logo) setLogoUri(logo);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const remaining = isPro ? Infinity : Math.max(0, FREE_DAILY - usageCount);

  const parsedItems = useMemo(
    () =>
      items.map((it) => {
        const qty = Math.max(0, Number(it.qty) || 0);
        const price = Math.max(0, Number(it.price) || 0);
        return { ...it, qty, price, amount: qty * price, label: it.name.trim() || '항목' };
      }),
    [items],
  );

  const totals = useMemo(() => {
    const supplyRaw = parsedItems.reduce((s, it) => s + it.amount, 0);
    if (vatMode === 'separate') {
      const vat = supplyRaw * 0.1;
      return { supply: supplyRaw, vat, total: supplyRaw + vat };
    }
    if (vatMode === 'include') {
      const supply = Math.round(supplyRaw / 1.1);
      return { supply, vat: supplyRaw - supply, total: supplyRaw };
    }
    return { supply: supplyRaw, vat: 0, total: supplyRaw };
  }, [parsedItems, vatMode]);

  const updateItem = useCallback((id: string, key: keyof LineItem, value: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
  }, []);

  const unlockPro = useCallback(async () => {
    const key = licenseKey.trim().toUpperCase();
    if (!key) {
      Alert.alert('안내', '라이선스 키를 입력하세요.');
      return;
    }
    if (key === DEMO_KEY || verifyKey(key)) {
      await AsyncStorage.setItem(STORAGE_PLAN, 'pro');
      setIsPro(true);
      setProOpen(false);
      Alert.alert('완료', 'Pro가 활성화되었습니다.');
      return;
    }
    Alert.alert('실패', '유효하지 않은 키입니다.');
  }, [licenseKey]);

  const pickLogo = useCallback(async () => {
    if (!isPro) {
      setProOpen(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const dataUrl = asset.base64
      ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
      : asset.uri;
    setLogoUri(dataUrl);
    await AsyncStorage.setItem(STORAGE_LOGO, dataUrl);
  }, [isPro]);

  const buildHtml = useCallback(() => {
    const dateObj = quoteDate ? new Date(`${quoteDate}T00:00:00`) : new Date();
    const validObj = new Date(dateObj);
    validObj.setDate(validObj.getDate() + Math.max(1, Number(validDays) || 14));
    const fmt = (d: Date) => d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const vatLabel = vatMode === 'separate' ? '별도 10%' : vatMode === 'include' ? '포함' : '없음';
    const rows = parsedItems
      .map(
        (it) => `<tr>
          <td>${escapeHtml(it.label)}</td>
          <td class="num">${it.qty}</td>
          <td class="num">${money(it.price)}</td>
          <td class="num">${money(it.amount)}</td>
        </tr>`,
      )
      .join('');
    const logo = isPro && logoUri ? `<img src="${logoUri}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1px solid #d8d2c6" />` : '';
    const watermark = isPro ? '' : `
      <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0">
        <div style="font-size:42px;color:rgba(26,31,43,.08);transform:rotate(-28deg);font-weight:700">하루 견적서 · FREE</div>
      </div>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8" />
      <style>
        body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Segoe UI",sans-serif;color:${colors.paperInk};background:${colors.paper};margin:0;padding:36px}
        .wrap{position:relative;z-index:1}
        h1{font-size:28px;margin:0 0 8px}
        .muted{color:${colors.paperMuted};font-size:12px;line-height:1.55}
        .top{display:flex;justify-content:space-between;gap:16px;margin-bottom:22px}
        .brand{display:flex;gap:12px;align-items:flex-start}
        .client{border-top:1px solid #d8d2c6;border-bottom:1px solid #d8d2c6;padding:12px 0;margin-bottom:18px;display:flex;justify-content:space-between;gap:12px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;font-size:11px;color:${colors.paperMuted};padding:0 0 8px;border-bottom:1px solid #d8d2c6}
        th.num,td.num{text-align:right}
        td{padding:10px 0;border-bottom:1px solid rgba(216,210,198,.65);vertical-align:top}
        .totals{margin-top:18px;margin-left:auto;width:240px}
        .row{display:flex;justify-content:space-between;padding:6px 0;color:${colors.paperMuted};font-size:13px}
        .grand{border-top:2px solid ${colors.paperInk};margin-top:6px;padding-top:10px;color:${colors.paperInk};font-size:17px;font-weight:700}
        .note{margin-top:24px;white-space:pre-wrap;color:${colors.paperMuted};font-size:12px;line-height:1.6}
        .foot{margin-top:28px;font-size:11px;color:#8a9180}
      </style></head><body>
      ${watermark}
      <div class="wrap">
        <div class="top">
          <div class="brand">${logo}<div>
            <h1>견적서</h1>
            <div class="muted"><strong style="color:${colors.paperInk};font-size:14px">${escapeHtml(sellerName || '상호명')}</strong><br/>
            ${[sellerContact, sellerEmail, sellerBiz ? `사업자 ${sellerBiz}` : ''].filter(Boolean).map(escapeHtml).join('<br/>')}</div>
          </div></div>
          <div class="muted" style="text-align:right">
            <strong style="display:block;color:${colors.paperInk};font-size:14px;margin-bottom:4px">견적번호 ${escapeHtml(quoteNo || '-')}</strong>
            발행일 ${fmt(dateObj)}<br/>유효기간 ${fmt(validObj)}까지
          </div>
        </div>
        <div class="client">
          <div><div class="muted">수신</div><div style="font-weight:700">${escapeHtml(clientName || '고객')}</div></div>
          <div><div class="muted">부가세</div><div style="font-weight:700">${vatLabel}</div></div>
        </div>
        <table>
          <thead><tr><th>항목</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="row"><span>공급가액</span><span>${money(totals.supply)}</span></div>
          <div class="row"><span>부가세</span><span>${money(totals.vat)}</span></div>
          <div class="row grand"><span>합계</span><span>${money(totals.total)}</span></div>
        </div>
        <div class="note">${escapeHtml(notes)}</div>
        <div class="foot">Generated with 하루 견적서 · Expo · stargateedu.co.kr/quote-maker</div>
      </div>
    </body></html>`;
  }, [
    clientName,
    isPro,
    logoUri,
    notes,
    parsedItems,
    quoteDate,
    quoteNo,
    sellerBiz,
    sellerContact,
    sellerEmail,
    sellerName,
    totals,
    validDays,
    vatMode,
  ]);

  const downloadPdf = useCallback(async () => {
    if (!isPro && remaining <= 0) {
      Alert.alert('무료 횟수 소진', '오늘 무료 횟수를 모두 사용했습니다. Pro로 계속하세요.', [
        { text: '닫기', style: 'cancel' },
        { text: 'Pro 열기', onPress: () => setProOpen(true) },
      ]);
      return;
    }
    setBusy(true);
    try {
      const file = await Print.printToFileAsync({ html: buildHtml(), base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: '견적서 PDF 공유',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('완료', `PDF가 생성되었습니다.\n${file.uri}`);
      }
      if (!isPro) {
        const next = usageCount + 1;
        setUsageCount(next);
        await AsyncStorage.setItem(STORAGE_USAGE, JSON.stringify({ date: todayKey(), count: next }));
      }
    } catch (e) {
      console.error(e);
      Alert.alert('오류', 'PDF 생성에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }, [buildHtml, isPro, remaining, usageCount]);

  if (!ready) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.acc} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.nav}>
            <Text style={styles.brand}>Stargate · 하루 견적서</Text>
            <View style={[styles.pill, isPro ? styles.pillPro : styles.pillFree]}>
              <Text style={[styles.pillText, { color: isPro ? colors.good : colors.warm }]}>
                {isPro ? 'PRO · 무제한' : `FREE · 오늘 ${remaining}회`}
              </Text>
            </View>
          </View>

          <Text style={styles.title}>하루 견적서</Text>
          <Text style={styles.lead}>항목을 입력하고 PDF로 공유하세요. Expo Go에서도 동일하게 동작합니다.</Text>

          <View style={styles.aside}>
            <Text style={styles.asideK}>오늘 남은 무료 다운로드</Text>
            <Text style={styles.asideV}>{isPro ? '∞' : String(remaining)}회</Text>
          </View>

          <Section title="발행자">
            <Field label="상호 / 이름" value={sellerName} onChangeText={setSellerName} />
            <Field label="연락처" value={sellerContact} onChangeText={setSellerContact} keyboardType="phone-pad" />
            <Field label="이메일" value={sellerEmail} onChangeText={setSellerEmail} keyboardType="email-address" autoCapitalize="none" />
            <Field label="사업자등록번호 (선택)" value={sellerBiz} onChangeText={setSellerBiz} />
            {isPro ? (
              <Pressable style={styles.ghostBtn} onPress={pickLogo}>
                <Text style={styles.ghostBtnText}>{logoUri ? '로고 변경' : '로고 선택'}</Text>
              </Pressable>
            ) : null}
          </Section>

          <Section title="고객 · 문서">
            <Field label="고객명" value={clientName} onChangeText={setClientName} />
            <Field label="견적번호" value={quoteNo} onChangeText={setQuoteNo} />
            <Field label="발행일 (YYYY-MM-DD)" value={quoteDate} onChangeText={setQuoteDate} />
            <Field label="유효기간(일)" value={validDays} onChangeText={setValidDays} keyboardType="number-pad" />
            <Text style={styles.label}>부가세</Text>
            <View style={styles.segment}>
              {(
                [
                  ['separate', '별도'],
                  ['include', '포함'],
                  ['none', '없음'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  style={[styles.segmentItem, vatMode === key && styles.segmentItemOn]}
                  onPress={() => setVatMode(key)}
                >
                  <Text style={[styles.segmentText, vatMode === key && styles.segmentTextOn]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <Section
            title="항목"
            right={
              <Pressable onPress={() => setItems((prev) => [...prev, newItem()])}>
                <Text style={styles.link}>+ 항목</Text>
              </Pressable>
            }
          >
            {items.map((it) => (
              <View key={it.id} style={styles.itemCard}>
                <Field label="항목명" value={it.name} onChangeText={(v) => updateItem(it.id, 'name', v)} />
                <View style={styles.row2}>
                  <View style={{ flex: 1 }}>
                    <Field label="수량" value={it.qty} onChangeText={(v) => updateItem(it.id, 'qty', v)} keyboardType="number-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="단가" value={it.price} onChangeText={(v) => updateItem(it.id, 'price', v)} keyboardType="number-pad" />
                  </View>
                </View>
                <View style={styles.itemFooter}>
                  <Text style={styles.muted}>{money((Number(it.qty) || 0) * (Number(it.price) || 0))}</Text>
                  <Pressable
                    onPress={() => {
                      if (items.length <= 1) {
                        Alert.alert('안내', '항목은 최소 1개 필요합니다.');
                        return;
                      }
                      setItems((prev) => prev.filter((x) => x.id !== it.id));
                    }}
                  >
                    <Text style={styles.danger}>삭제</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Section>

          <Section title="비고">
            <Field label="안내 문구" value={notes} onChangeText={setNotes} multiline />
          </Section>

          <View style={styles.preview}>
            <Text style={styles.previewTitle}>미리보기 합계</Text>
            <Text style={styles.previewTotal}>{money(totals.total)}</Text>
            <Text style={styles.muted}>공급 {money(totals.supply)} · 부가세 {money(totals.vat)}</Text>
          </View>

          <Pressable style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={downloadPdf} disabled={busy}>
            {busy ? <ActivityIndicator color="#0b1020" /> : <Text style={styles.primaryBtnText}>PDF 만들기 / 공유</Text>}
          </Pressable>
          <Pressable style={styles.warmBtn} onPress={() => setProOpen(true)}>
            <Text style={styles.warmBtnText}>Pro 잠금 해제</Text>
          </Pressable>
          <Pressable
            style={styles.ghostBtn}
            onPress={() => {
              setSellerName('Stargate Studio');
              setSellerContact('010-0000-0000');
              setSellerEmail('hello@stargateedu.co.kr');
              setSellerBiz('');
              setClientName('홍길동 고객님');
              setQuoteNo(defaultQuoteNo());
              setQuoteDate(todayKey());
              setValidDays('14');
              setVatMode('separate');
              setNotes('· 본 견적은 발행일로부터 유효합니다.\n· 작업 범위 변경 시 금액이 조정될 수 있습니다.');
              setItems([
                newItem({ name: '웹사이트 랜딩 페이지 제작', qty: '1', price: '500000' }),
                newItem({ name: '모바일 반응형 최적화', qty: '1', price: '150000' }),
                newItem({ name: '수정 라운드 (2회)', qty: '1', price: '80000' }),
              ]);
            }}
          >
            <Text style={styles.ghostBtnText}>초기화</Text>
          </Pressable>

          <Text style={styles.footer}>웹 버전: stargateedu.co.kr/quote-maker</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={proOpen} transparent animationType="fade" onRequestClose={() => setProOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Pro로 잠금 해제</Text>
            <Text style={styles.muted}>워터마크 제거 · 로고 · 무제한. 데모 키로 바로 체험할 수 있습니다.</Text>
            <Text style={styles.price}>₩9,900 <Text style={styles.muted}>원타임</Text></Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={async () => {
                try {
                  await Linking.openURL(PAY_URL);
                } catch {
                  Alert.alert('결제', `브라우저에서 열어 결제한 뒤 키를 입력하세요.\n${PAY_URL}`);
                }
              }}
            >
              <Text style={styles.primaryBtnText}>결제 페이지 열기</Text>
            </Pressable>
            <Field label="라이선스 키" value={licenseKey} onChangeText={setLicenseKey} autoCapitalize="characters" />
            <Text style={[styles.muted, { marginBottom: 10 }]}>데모 키: {DEMO_KEY}</Text>
            <Pressable style={styles.warmBtn} onPress={unlockPro}>
              <Text style={styles.warmBtnText}>키로 잠금 해제</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => setProOpen(false)}>
              <Text style={styles.ghostBtnText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'characters' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 48 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 10 },
  brand: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  pillFree: { borderColor: 'rgba(255,184,107,.35)', backgroundColor: 'rgba(255,184,107,.08)' },
  pillPro: { borderColor: 'rgba(99,214,160,.4)', backgroundColor: 'rgba(99,214,160,.08)' },
  pillText: { fontSize: 11.5, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 32, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  lead: { color: colors.sub, fontSize: 14.5, lineHeight: 22, marginBottom: 16 },
  aside: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel2,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  asideK: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  asideV: { color: colors.ink, fontSize: 24, fontWeight: '700' },
  section: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  field: { marginBottom: 10 },
  label: { color: colors.muted, fontSize: 12, marginBottom: 5, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: 'rgba(10,13,20,.55)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
  },
  textarea: { minHeight: 88, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 10 },
  itemCard: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: colors.panel2,
  },
  itemFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muted: { color: colors.sub, fontSize: 13, lineHeight: 20 },
  danger: { color: colors.danger, fontWeight: '600' },
  link: { color: colors.acc, fontWeight: '700' },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  segmentItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(10,13,20,.35)',
  },
  segmentItemOn: { borderColor: colors.acc, backgroundColor: 'rgba(79,127,255,.15)' },
  segmentText: { color: colors.sub, fontWeight: '600', fontSize: 13 },
  segmentTextOn: { color: colors.ink },
  preview: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    backgroundColor: colors.panel2,
  },
  previewTitle: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  previewTotal: { color: colors.ink, fontSize: 28, fontWeight: '700', marginBottom: 4 },
  primaryBtn: {
    backgroundColor: colors.acc,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#0b1020', fontWeight: '700', fontSize: 15 },
  warmBtn: {
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,184,107,.35)',
    backgroundColor: 'rgba(255,184,107,.12)',
  },
  warmBtnText: { color: colors.warm, fontWeight: '700' },
  ghostBtn: {
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.panel,
  },
  ghostBtnText: { color: colors.ink, fontWeight: '600' },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,8,14,.72)',
    justifyContent: 'center',
    padding: 18,
  },
  modal: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 18,
  },
  modalTitle: { color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 8 },
  price: { color: colors.ink, fontSize: 28, fontWeight: '700', marginVertical: 12 },
});
