
import React from 'react';
import { Youtube, Instagram, MessageCircle } from 'lucide-react';

const SupportedPlatforms: React.FC = () => {
  const platforms = [
    { name: 'YouTube Shorts', icon: <Youtube className="w-6 h-6" />, supported: true, note: 'Desktop + mobile web' },
    { name: 'Instagram Reels', icon: <Instagram className="w-6 h-6" />, supported: true, note: 'Feed + explore' },
    { name: 'TikTok', icon: <MessageCircle className="w-6 h-6" />, supported: true, note: 'For You & search' },
  ];

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Coverage & Support</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">
            Optimized for short-form feeds. ScrollSafe currently supports Shorts, Reels, and TikTok with more platforms in R&D.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {platforms.map((p, i) => (
            <div 
              key={i} 
              className={`p-6 rounded-xl border flex flex-col items-center justify-center space-y-3 transition-all ${
                p.supported 
                ? 'border-teal-100 bg-teal-50/30' 
                : 'border-slate-100 bg-slate-50 opacity-60'
              }`}
            >
              <div className={p.supported ? 'text-teal-600' : 'text-slate-400'}>
                {p.icon}
              </div>
              <span className={`font-semibold text-sm ${p.supported ? 'text-slate-900' : 'text-slate-500'}`}>
                {p.name}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-teal-600">Supported</span>
              <span className="text-xs text-slate-500">{p.note}</span>
            </div>
          ))}
        </div>
        
        <p className="mt-12 text-center text-sm text-slate-400 italic">
          * Detection accuracy varies by platform compression and video quality.
        </p>
      </div>
    </section>
  );
};

export default SupportedPlatforms;
