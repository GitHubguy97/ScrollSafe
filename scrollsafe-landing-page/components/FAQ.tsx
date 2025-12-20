
'use client';

import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { FAQItem } from '../types';

const FAQ: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: "Which platforms does ScrollSafe support?",
      answer:
        "Today ScrollSafe runs on YouTube Shorts, Instagram Reels, and TikTok on desktop Chrome. We’re experimenting with other short-form feeds and will roll them out once the signal is trustworthy."
    },
    {
      question: "How accurate are the detections?",
      answer:
        "We combine heuristics from the page (author, caption, hashtags) with a frame-level deep scan when you request it. The badge shows a likelihood—not an absolute verdict—so you can decide when to treat something as AI."
    },
    {
      question: "Does ScrollSafe slow down my feed?",
      answer:
        "No. The content script only inspects the current short-form player, and deep scans run on our backend when you explicitly request them. Browsing performance stays the same."
    },
    {
      question: "Do you collect any of my personal data?",
      answer:
        "We don’t see your passwords, private messages, or unrelated browsing history. The extension stores a short “recent videos” list locally so you can revisit detections, and deep-scan frames are deleted after inference."
    },
    {
      question: "Why does the extension need 'Read and change data' permissions?",
      answer:
        "Chrome requires that permission to let us find the short-form video element on a page and inject the ScrollSafe badge. We scope it only to YouTube, Instagram, and TikTok."
    },
    {
      question: "How do I report a bug or request a platform?",
      answer:
        "Tap the “Report a bug” or “Request platform” buttons below, or email support@scroll-safe.com. You can also open an issue on our GitHub repo."
    }
  ];

  return (
    <section id="faq" className="py-24 bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex justify-between items-center p-6 text-left hover:bg-slate-50 transition-colors"
              >
                <span className="font-bold text-slate-900">{faq.question}</span>
                {openIndex === i ? (
                  <Minus className="w-5 h-5 text-[#2d7bff]" />
                ) : (
                  <Plus className="w-5 h-5 text-slate-400" />
                )}
              </button>
              <div
                className={`px-6 text-slate-600 leading-relaxed overflow-hidden transition-[max-height] duration-300 ease-in-out ${
                  openIndex === i ? 'max-h-80 pb-6' : 'max-h-0 pb-0'
                }`}
              >
                <p className="pt-1">{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
