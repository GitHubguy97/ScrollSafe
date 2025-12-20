
import React from "react";
import { Search, Cpu, Info } from "lucide-react";
import { Step } from "../types";

const HowItWorks: React.FC = () => {
  const steps: Step[] = [
    {
      title: "Detect",
      description: "ScrollSafe locks onto short-form players the moment Shorts, Reels, or TikToks enter view.",
      icon: <Search className="w-6 h-6" />
    },
    {
      title: "Analyze",
      description: "We run ScrollSafe’s signal stack — visual fingerprints, temporal artifacts, and feed telemetry — against our heuristics.",
      icon: <Cpu className="w-6 h-6" />
    },
    {
      title: "Label",
      description: "A compact badge appears on the player with a tooltip explaining why it's Verified, Suspicious, or Likely AI.",
      icon: <Info className="w-6 h-6" />
    },
    {
      title: "Doom Scroller",
      description: "Our always-on crawler runs on ScrollSafe servers, patrolling public feeds, flagging AI clips, and preloading metadata so the extension can warn you before you reach them.",
      icon: <Search className="w-6 h-6" />
    }
  ];

  return (
    <section id="how-it-works" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">How ScrollSafe Works</h2>
          <p className="mt-4 text-lg text-slate-600">
            Advanced detection, simplified for you. No complex setup, just browse like you always do.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center transition-all hover:shadow-md">
              <div className="w-12 h-12 bg-[#e8f1ff] text-[#2d7bff] rounded-xl flex items-center justify-center mb-6 shadow-inner">
                {step.icon}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-4">{step.title}</h3>
              <p className="text-slate-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
