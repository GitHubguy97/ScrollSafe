import React from 'react';
import { Chrome, Lock, Zap, Award } from 'lucide-react';

const TrustStrip: React.FC = () => {
  const chips = [
    { icon: <Chrome className="w-4 h-4" />, text: "Chrome Web Store" },
    { icon: <Lock className="w-4 h-4" />, text: "Privacy-first" },
    { icon: <Zap className="w-4 h-4" />, text: "Fast & Lightweight" },
    { icon: <Award className="w-4 h-4" />, text: "Hackathon Finalist" }
  ];

  return (
    <div className="bg-slate-50 py-10 border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 overflow-x-auto">
        <div className="flex justify-center items-center space-x-6 md:space-x-12 whitespace-nowrap min-w-max px-4">
          {chips.map((chip, i) => (
            <div key={i} className="flex items-center text-slate-500 text-sm font-medium">
              <span className="mr-2 text-slate-400">{chip.icon}</span>
              {chip.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrustStrip;
