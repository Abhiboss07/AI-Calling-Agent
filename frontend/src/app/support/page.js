'use client';

import { useState } from 'react';
import { ChevronDown, LifeBuoy, Mail, MessageSquare, Phone, ShieldCheck } from 'lucide-react';

const FAQS = [
  {
    q: 'Why are calls not starting immediately?',
    a: 'Most delays are queue-related or provider retries. Check active campaign limits and available concurrent capacity in your dashboard.'
  },
  {
    q: 'How do I verify backend connectivity?',
    a: 'Open your backend health endpoint and confirm 200 status. Then verify NEXT_PUBLIC_API_BASE points to the same environment.'
  },
  {
    q: 'Can I monitor transcripts live?',
    a: 'Yes. Use the Real-Time Dashboard where transcripts stream for active calls once WebSocket is connected.'
  },
  {
    q: 'How do I rotate API credentials safely?',
    a: 'Create a new credential, update environment variables, redeploy, and revoke old keys after validating call flow.'
  }
];

export default function SupportPage() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="support-page">
      <section className="support-hero fade-in-up">
        <div>
          <p className="section-label">SUPPORT CENTER</p>
          <h1 className="page-title" style={{ marginBottom: 8 }}>Get Help Fast</h1>
          <p className="text-secondary">Troubleshoot deployments, call routing, and agent workflows with direct support channels.</p>
        </div>
        <div className="support-shield">
          <ShieldCheck size={18} />
          Priority support enabled
        </div>
      </section>

      <section className="support-grid">
        <article className="card support-card fade-in-up delay-1">
          <div className="support-icon"><MessageSquare size={18} /></div>
          <h3>Live Chat</h3>
          <p>Chat with engineering support for deployment and runtime incidents.</p>
          <button className="btn btn-primary">Start Chat</button>
        </article>

        <article className="card support-card fade-in-up delay-2">
          <div className="support-icon"><Mail size={18} /></div>
          <h3>Email Support</h3>
          <p>Share logs and stack traces for deep-dive investigations.</p>
          <button className="btn btn-outline">support@estateagent.ai</button>
        </article>

        <article className="card support-card fade-in-up delay-3">
          <div className="support-icon"><Phone size={18} /></div>
          <h3>On-Call Line</h3>
          <p>For urgent production incidents requiring immediate callback.</p>
          <button className="btn btn-outline">+91 80 4000 1122</button>
        </article>
      </section>

      <section className="card fade-in-up delay-2">
        <div className="panel-head">
          <h3>Frequently Asked Questions</h3>
          <span className="badge"><LifeBuoy size={14} /> Guided fixes</span>
        </div>
        <div className="faq-list">
          {FAQS.map((item, index) => {
            const open = index === openIndex;
            return (
              <button
                key={item.q}
                className={`faq-item ${open ? 'open' : ''}`}
                onClick={() => setOpenIndex(open ? -1 : index)}
              >
                <div className="faq-head">
                  <span>{item.q}</span>
                  <ChevronDown size={16} />
                </div>
                <div className="faq-body">{item.a}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
