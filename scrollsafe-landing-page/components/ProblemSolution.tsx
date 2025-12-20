import React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const ProblemSolution: React.FC = () => (
  <section className="py-24 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid md:grid-cols-2 gap-16 items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-bold uppercase tracking-wider">
            The Problem
          </div>
          <h2 className="text-3xl font-bold text-slate-900 leading-tight">
            Short-form feeds are flooded with AI videos.
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            TikTok, Instagram Reels, and YouTube Shorts move too fast for manual verification. That
            makes it easy for synthetic clips to go viral without context or accountability.
          </p>
          <ul className="space-y-3">
            {[
              "Convincing deepfakes used for misinformation",
              "AI ads blending into organic content",
              "No platform-native signal about authenticity",
            ].map((item, i) => (
              <li key={i} className="flex items-start text-slate-600">
                <AlertCircle className="w-5 h-5 text-red-400 mr-3 mt-1 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6 bg-white p-8 rounded-2xl border border-slate-100 shadow-[0_20px_60px_-45px_rgba(45,123,255,0.6)]">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#e8f1ff] text-[#2d7bff] text-xs font-bold uppercase tracking-wider">
            The Solution
          </div>
          <h2 className="text-3xl font-bold text-slate-900 leading-tight">
            ScrollSafe surfaces the truth with clear labels.
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            ScrollSafe delivers an always-on transparency layer for short-form video. We look at
            on-page metadata, captions, and frame signatures to estimate whether a clip is likely
            AI—without slowing down your scroll.
          </p>
          <ul className="space-y-3">
            {[
              "Instant badges for Shorts, Reels, and TikToks",
              "Inline context on why something looks synthetic",
              "Privacy-first design with zero tracking",
            ].map((item, i) => (
              <li key={i} className="flex items-start text-slate-600">
                <CheckCircle2 className="w-5 h-5 text-[#2d7bff] mr-3 mt-1 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  </section>
);

export default ProblemSolution;
