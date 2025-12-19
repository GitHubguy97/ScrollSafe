'use client';

import React, { useMemo, useState } from "react";

type DemoSectionProps = {
  demoUrl: string;
};

const DemoSection: React.FC<DemoSectionProps> = ({ demoUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const embedUrl = useMemo(() => {
    try {
      const parsed = new URL(demoUrl);
      const videoId = parsed.searchParams.get("v");
      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
      }
    } catch {
      // fall back to raw URL
    }
    return demoUrl;
  }, [demoUrl]);

  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900">See it in action</h2>
          <p className="mt-4 text-slate-600">The ScrollSafe experience is seamless and informative.</p>
        </div>

        <div className="relative max-w-4xl mx-auto aspect-video rounded-3xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-100">
          {isPlaying ? (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embedUrl}
              title="ScrollSafe demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              onClick={() => setIsPlaying(true)}
            >
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg mb-4">
                <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-teal-600 border-b-[12px] border-b-transparent ml-1" />
              </div>
              Click to watch the real demo
            </button>
          )}

        </div>
      </div>
    </section>
  );
};

export default DemoSection;
