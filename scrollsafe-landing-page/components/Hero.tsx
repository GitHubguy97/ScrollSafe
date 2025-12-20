
'use client';

import React, { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";

type HeroProps = {
  chromeStoreUrl: string;
  demoUrl: string;
  heroMediaUrl: string;
};

const GIF_LOOP_MS = 60000;

const Hero: React.FC<HeroProps> = ({ chromeStoreUrl, demoUrl, heroMediaUrl }) => {
  const isGif = heroMediaUrl.toLowerCase().includes(".gif");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isGif) return;
    const interval = window.setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, GIF_LOOP_MS);
    return () => window.clearInterval(interval);
  }, [isGif]);

  const mediaSrc = useMemo(() => {
    if (!isGif) return heroMediaUrl;
    const separator = heroMediaUrl.includes("?") ? "&" : "?";
    return `${heroMediaUrl}${separator}loop=${refreshKey}`;
  }, [heroMediaUrl, isGif, refreshKey]);

  return (
    <section className="relative pt-16 pb-24 lg:pt-32 lg:pb-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-center">
          <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
            <h1 className="text-4xl tracking-tight font-extrabold text-slate-900 sm:text-5xl md:text-6xl">
              <span className="block">Trust Shorts, Reels, and TikToks again.</span>
              <span className="block bg-gradient-to-r from-[#2d7bff] to-[#58c8ff] text-transparent bg-clip-text">
                ScrollSafe spots likely AI in seconds.
              </span>
            </h1>
            <p className="mt-3 text-base text-slate-500 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl leading-relaxed">
              Built specifically for short-form feeds, ScrollSafe adds a subtle badge to YouTube
              Shorts, Instagram Reels, and TikTok so you can see when a clip is probably synthetic.
            </p>
            <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href={chromeStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center px-8 py-4 border border-transparent text-base font-semibold rounded-lg text-white bg-gradient-to-r from-[#2d7bff] to-[#58c8ff] hover:shadow-lg md:text-lg transition-all inline-flex"
                >
                  Install on Chrome
                </a>
                <a
                  href={demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center px-8 py-4 border border-slate-200 text-base font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50 md:text-lg transition-all"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Watch demo
                </a>
              </div>
            </div>
          </div>

          <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
            <div className="relative mx-auto w-full rounded-2xl shadow-2xl overflow-hidden border border-slate-200 bg-slate-50 p-1">
              {/* Fake Browser UI */}
              <div className="bg-slate-100 h-8 flex items-center px-4 space-x-1.5 rounded-t-xl border-b border-slate-200">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
              </div>
              <div className="relative aspect-video bg-white overflow-hidden rounded-b-xl">
                {isGif ? (
                  <img
                    src={mediaSrc}
                    alt="ScrollSafe demo preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    src={mediaSrc}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute bottom-4 left-4 right-4 bg-gradient-to-t from-black/50 to-transparent p-4">
                  <div className="h-4 w-3/4 bg-white/30 rounded mb-2"></div>
                  <div className="h-4 w-1/2 bg-white/20 rounded"></div>
                </div>
              </div>
            </div>
            <p className="absolute -bottom-8 left-0 right-0 text-center text-xs text-slate-400 font-medium italic">
              Labels appear automatically while you scroll.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
