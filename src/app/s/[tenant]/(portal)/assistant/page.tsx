import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPortalView, getTenantOr404, getViewer, tenantBase } from '@/server/request';
import { getAssistantModel } from '@/server/ai/assistant-model';
import { getConversation, listConversations } from '@/server/services/family-assistant';
import type { AssistantCard } from '@/server/db/schema';
import { deleteConversationAction } from './actions';
import { DraftButtons, MessageForm } from './chat-forms';

export const metadata = { title: 'Family assistant' };
export const dynamic = 'force-dynamic';

const KIND = { absence_notice: 'Absence notice', office_request: 'Message to the office' } as const;
const STATUS = { proposed: 'Waiting for you', confirmed: 'Sent', dismissed: 'Discarded', failed: 'Not sent' } as const;

type Props = { params: Promise<{ tenant: string }>; searchParams: Promise<{ c?: string }> };

export default async function AssistantPage({ params, searchParams }: Props) {
  const key = (await params).tenant;
  const { c } = await searchParams;
  const tenant = await getTenantOr404(key);
  const [view, viewer, base] = await Promise.all([getPortalView(tenant.id), getViewer(tenant.id), tenantBase(key)]);
  if (!view.activeModules.some((m) => m.id === 'family_assistant')) notFound();
  if (viewer.kind !== 'family') {
    return (
      <div className="container content-page ai-page">
        <h1>Family assistant</h1>
        <p>
          <Link href={`${base}/login?next=${encodeURIComponent(`${base}/assistant`)}`}>Sign in with your family account</Link> to use the assistant.
        </p>
      </div>
    );
  }
  const [list, open] = await Promise.all([listConversations(tenant.id, viewer), c ? getConversation(tenant.id, viewer, c).catch(() => null) : Promise.resolve(null)]);
  if (c && !open) notFound();
  const ready = getAssistantModel() !== null;
  const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: tenant.timezone });
  const school = view.profile.shortName ?? view.profile.displayName;
  const lastIdx = open ? open.messages.length - 1 : -1;

  return (
    <div className="container content-page fa-page">
      <div className="ops-head">
        <h1>{open ? open.conversation.title : 'Family assistant'}</h1>
        {open && (
          <Link className="btn btn-quiet" href={`${base}/assistant`}>
            New conversation
          </Link>
        )}
      </div>
      {!open && (
        <p className="section-intro">
          Ask about {school}&apos;s calendar and policies, check on your requests, or get help reporting an absence. It only sees your own family&apos;s information, and it
          prepares messages for you to review: nothing goes to the office until you press Send.
        </p>
      )}
      {!ready && <div className="notice">The assistant is not switched on yet. Please use the forms or call the office.</div>}

      {open && (
        <ol className="fa-messages" aria-label="Conversation">
          {open.messages.map((m, i) => (
            <li key={m.id} className={`fa-msg fa-msg-${m.role}`} id={i === lastIdx ? 'latest' : undefined}>
              <span className="visually-hidden">{m.role === 'user' ? 'You:' : 'Assistant:'}</span>
              <p className="fa-text">{m.content}</p>
              {(m.cards as AssistantCard[]).length > 0 && <Cards cards={m.cards as AssistantCard[]} actions={open.actions} base={base} tenantKey={key} />}
            </li>
          ))}
        </ol>
      )}

      {ready && <MessageForm key={open?.conversation.id ?? 'new'} tenantKey={key} conversationId={open?.conversation.id ?? null} examples={['When is the next day off?', 'Where is my request?', 'My child is sick tomorrow']} />}

      {open && (
        <form action={deleteConversationAction.bind(null, key, open.conversation.id)} className="fa-delete">
          <button type="submit" className="btn btn-quiet btn-sm">
            Delete this conversation
          </button>
        </form>
      )}

      {list.length > 0 && (
        <section aria-labelledby="past-title" className="fa-past">
          <h2 id="past-title">Your conversations</h2>
          <ul className="ops-list">
            {list.map((x) => (
              <li key={x.id}>
                <Link href={`${base}/assistant?c=${x.id}`} aria-current={x.id === open?.conversation.id ? 'page' : undefined}>
                  <span className="ops-subject">{x.title}</span>
                  <span className="ops-meta">{fmt.format(x.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted">Only you can see these. The school sees how many questions were asked, never what was said. Old conversations are deleted automatically.</p>
        </section>
      )}
    </div>
  );
}

type Action = Awaited<ReturnType<typeof getConversation>>['actions'][string];

function Cards({ cards, actions, base, tenantKey }: { cards: AssistantCard[]; actions: Record<string, Action>; base: string; tenantKey: string }) {
  const sources = cards.filter((x) => x.kind === 'source');
  return (
    <>
      {cards.map((card) => {
        if (card.kind === 'request')
          return (
            <p key={card.id} className="fa-card">
              <Link href={`${base}/requests/${card.id}`}>
                R-{card.number} · {card.subject}
              </Link>{' '}
              <span className="badge">{card.status}</span>
            </p>
          );
        if (card.kind === 'action') {
          const a = actions[card.actionId];
          if (!a) return null;
          return (
            <section key={a.id} className="card fa-draft" aria-label={KIND[a.kind]}>
              <p className="fa-draft-head">
                <strong>{KIND[a.kind]}</strong> <span className="badge">{a.expired ? 'Expired' : STATUS[a.status]}</span>
              </p>
              <p className="fa-draft-summary">{a.summary}</p>
              {a.status === 'proposed' && !a.expired ? (
                <DraftButtons tenantKey={tenantKey} actionId={a.id} />
              ) : a.result ? (
                <p className={a.status === 'confirmed' ? 'fa-draft-result' : 'muted'} role="status">
                  {a.status === 'confirmed' ? (a.result.startsWith('R-') ? `Sent to the office as ${a.result}. You can follow it in My requests.` : 'Sent to the office.') : a.result}
                </p>
              ) : a.expired ? (
                <p className="muted">Drafts expire after a day. Ask again if you still need it.</p>
              ) : null}
            </section>
          );
        }
        return null;
      })}
      {sources.length > 0 && (
        <>
          <h3 className="ai-sources-title">Sources</h3>
          <ol className="ai-sources">
            {sources.map((s, i) => (
              <li key={i}>
                {s.url ? <a href={s.url}>{s.title}</a> : <strong>{s.title}</strong>}
                {s.section && s.section !== s.title && <span className="muted"> · {s.section}</span>}
                <blockquote>{s.quote}</blockquote>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
