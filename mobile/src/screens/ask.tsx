import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';

import { SourceChip } from '@/components/family-ui';
import { Icon } from '@/components/icon';
import { Button, Group, haptic, Row, SampleDataBanner, Text, TextButton } from '@/components/primitives';
import { EmptyState } from '@/components/states';
import type { AskMessage, Source } from '@/data/types';
import { dayLabel, firstOfNextMonth, fromIsoDate } from '@/lib/dates';
import { absenceTypeLabel, childById } from '@/lib/lookup';
import { useOpen } from '@/lib/nav';
import { ApiError } from '@/services/api';
import { suggestedQuestions, type AskContext } from '@/services/assistant';
import { useAsk, useConversation, useResolveDraft } from '@/services/queries';
import { useAppState } from '@/state/app-state';
import { spacing, touchTarget, type as typeScale } from '@/theme/tokens';
import { useAppTheme } from '@/theme/use-app-theme';

export default function Ask() {
  const params = useLocalSearchParams<{ contextType?: string; contextId?: string; contextTitle?: string; conversation?: string }>();
  const router = useRouter();
  const { colors, radius } = useAppTheme();
  const { askAvailable } = useAppState();
  const open = useOpen();
  const [conversationId, setConversationId] = useState<string | null>(params.conversation ?? null);
  const [context, setContext] = useState<AskContext | undefined>();
  const [text, setText] = useState('');
  const scroll = useRef<ScrollViewInstance>(null);

  const convo = useConversation(conversationId);
  const ask = useAsk();
  const resolve = useResolveDraft();

  // Opened from "Ask about this" or from history.
  useEffect(() => {
    if (params.contextType === 'announcement' && params.contextId) {
      setConversationId(null);
      setContext({ type: 'announcement', id: params.contextId, title: params.contextTitle ?? 'Announcement' });
    }
  }, [params.contextType, params.contextId, params.contextTitle]);
  useEffect(() => {
    if (params.conversation) setConversationId(params.conversation);
  }, [params.conversation]);

  const send = (q: string) => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    setText('');
    ask.mutate(
      { conversationId, text: question, context },
      {
        onSuccess: (c) => {
          setConversationId(c.id);
          setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
        },
        onError: () => haptic('error'),
      },
    );
  };

  const newConversation = () => {
    setConversationId(null);
    setContext(undefined);
    ask.reset();
  };

  const openSource = (src: Source) => open(src.type === 'contact' ? 'contact' : `${src.type}/${src.id}`);

  if (!askAvailable) {
    return <EmptyState icon="ask" title="The assistant isn't available" body="Your school's plan doesn't include the assistant." />;
  }

  const messages = convo.data?.messages ?? [];
  const quota = ask.error instanceof ApiError && ask.error.kind === 'quota';

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitleEnabled: false,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <TextButton label="History" onPress={() => router.push('/ask/history')} />
              {messages.length > 0 && <TextButton label="New" onPress={newConversation} />}
            </View>
          ),
        }}
      />
      <View style={{ flex: 1, backgroundColor: colors.grouped }}>
        <View style={[s.inputBar, { backgroundColor: colors.bg, borderBottomColor: colors.separator }]}>
          {context && (
            <View style={[s.context, { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="inbox" size={14} color={colors.textSecondary} />
              <Text variant="footnote" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                About: {context.title}
              </Text>
              <Pressable onPress={() => setContext(undefined)} accessibilityRole="button" accessibilityLabel="Remove context" hitSlop={10}>
                <Icon name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
          <View style={[s.field, { backgroundColor: colors.surfaceMuted, borderRadius: Math.min(radius, 14) }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Ask about your school"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Your question"
              style={[typeScale.body, { flex: 1, color: colors.text, paddingVertical: spacing.md }]}
              returnKeyType="send"
              onSubmitEditing={() => send(text)}
              editable={!quota}
              maxFontSizeMultiplier={2}
            />
            <Pressable
              onPress={() => send(text)}
              disabled={!text.trim() || ask.isPending}
              accessibilityRole="button"
              accessibilityLabel="Send question"
              style={{ minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.4 }}>
              {ask.isPending ? <ActivityIndicator color={colors.tint} /> : <Icon name="send" size={28} color={colors.tint} />}
            </Pressable>
          </View>
        </View>

        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 }}>
          <SampleDataBanner />
          {quota && (
            <Group style={{ padding: spacing.lg, gap: spacing.xs }}>
              <Text variant="headline">You've reached this month's limit</Text>
              <Text variant="subhead" tone="secondary">
                Your school has used this month's assistant questions. It will be available again on {firstOfNextMonth()}. You can still find everything in Calendar, Inbox and Family.
              </Text>
            </Group>
          )}
          {ask.isError && !quota && (
            <Text variant="subhead" tone="danger" accessibilityRole="alert">
              We couldn't send your question. Check your connection and try again.
            </Text>
          )}

          {messages.length === 0 && !ask.isPending ? (
            <View style={{ gap: spacing.md }}>
              <Text variant="title" accessibilityRole="header">
                How can I help?
              </Text>
              <Text variant="subhead" tone="secondary">
                I answer from your school's calendar, announcements and documents, and I show where each answer comes from. I can't see grades or homework.
              </Text>
              <View style={{ gap: spacing.sm }}>
                {(context ? ['What do I need to bring?', 'Summarize this announcement'] : suggestedQuestions).map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => send(q)}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.suggestion, { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderRadius: Math.min(radius, 14) }]}>
                    <Icon name="ask" size={16} color={colors.tint} />
                    <Text variant="body" style={{ flex: 1 }}>
                      {q}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) => (
              <MessageView
                key={m.id}
                m={m}
                onSource={openSource}
                onFollowUp={send}
                onDraft={(action) =>
                  resolve.mutate(
                    { conversationId: conversationId!, messageId: m.id, action },
                    { onSuccess: () => haptic(action === 'send' ? 'success' : 'light') },
                  )
                }
                draftBusy={resolve.isPending}
                onOpenAbsences={() => router.push('/inbox')}
              />
            ))
          )}
          {ask.isPending && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.tint} />
              <Text variant="subhead" tone="secondary">
                Looking through your school's information…
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

function MessageView({
  m,
  onSource,
  onFollowUp,
  onDraft,
  draftBusy,
  onOpenAbsences,
}: {
  m: AskMessage;
  onSource: (s: Source) => void;
  onFollowUp: (q: string) => void;
  onDraft: (action: 'send' | 'discard') => void;
  draftBusy: boolean;
  onOpenAbsences: () => void;
}) {
  const { colors, radius } = useAppTheme();
  if (m.role === 'user') {
    return (
      <View style={[s.userBubble, { backgroundColor: colors.tint, borderRadius: Math.max(radius, 14) }]}>
        {m.contextTitle && (
          <Text variant="caption" style={{ color: colors.onTint, opacity: 0.85 }}>
            About: {m.contextTitle}
          </Text>
        )}
        <Text variant="body" style={{ color: colors.onTint }}>
          {m.text}
        </Text>
      </View>
    );
  }
  const child = m.draft ? childById(m.draft.childId) : undefined;
  return (
    <View style={{ gap: spacing.sm }} accessibilityLabel={`Answer: ${m.text}`}>
      {m.status === 'not_found' && (
        <Text variant="caption" tone="warning">
          No verified answer
        </Text>
      )}
      <Text variant="body">{m.text}</Text>
      {m.sources.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="secondary">
            Sources
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {m.sources.map((src) => (
              <SourceChip key={`${src.type}-${src.id}`} source={src} onPress={() => onSource(src)} />
            ))}
          </View>
        </View>
      )}
      {m.draft && child && (
        <Group style={{ padding: spacing.lg, gap: spacing.sm }}>
          <Text variant="headline">Absence report (draft)</Text>
          <Row title={child.firstName} subtitle={`${absenceTypeLabel[m.draft.type]} · ${dayLabel(fromIsoDate(m.draft.dateFrom))}${m.draft.reason ? ` · ${m.draft.reason}` : ''}`} showChevron={false} />
          {m.draft.state === 'pending' ? (
            <>
              <Button label="Send to the office" loading={draftBusy} onPress={() => onDraft('send')} />
              <TextButton label="Discard" tone="secondary" onPress={() => onDraft('discard')} />
            </>
          ) : m.draft.state === 'sent' ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="subhead" tone="success">
                Sent. The office will see it right away.
              </Text>
              <TextButton label="See it in Inbox" onPress={onOpenAbsences} />
            </View>
          ) : (
            <Text variant="subhead" tone="secondary">
              Discarded. Nothing was sent.
            </Text>
          )}
        </Group>
      )}
      {m.followUps.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {m.followUps.map((f) => (
            <Pressable key={f} onPress={() => onFollowUp(f)} accessibilityRole="button" style={[s.followUp, { borderColor: colors.separator }]}>
              <Text variant="footnote" tone="tint" style={{ fontWeight: '600' }}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  inputBar: { padding: spacing.md, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  field: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md },
  context: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, minHeight: touchTarget + 8 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', padding: spacing.md, gap: 4 },
  followUp: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
});
