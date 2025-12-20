
import React from "react";
import { ShieldCheck, EyeOff, Database, Key } from "lucide-react";

type PrivacyTrustProps = {
  privacyPolicyUrl: string;
};

const PrivacyTrust: React.FC<PrivacyTrustProps> = ({ privacyPolicyUrl }) => {
  return (
    <section id="privacy" className="py-24 bg-slate-900 text-white overflow-hidden relative">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#2d7bff] rounded-full blur-[100px]"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#58c8ff] rounded-full blur-[100px]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold sm:text-4xl mb-6 flex items-center">
            <ShieldCheck className="w-8 h-8 mr-4 text-[#58c8ff]" />
            Privacy-first by design.
          </h2>
          <p className="text-slate-400 text-lg mb-12">
            ScrollSafe was built to improve the web, not to track you. We believe transparency starts with our own practices.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-8">
            <div className="flex items-start">
              <div className="shrink-0 p-3 bg-white/10 rounded-lg mr-4">
                <EyeOff className="w-6 h-6 text-[#58c8ff]" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">What we never collect</h3>
                <p className="text-slate-400 leading-relaxed">
                  We never see your passwords, private messages, bank details, or unrelated browsing history. Our extension only activates on specific video platforms you choose.
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="shrink-0 p-3 bg-white/10 rounded-lg mr-4">
                <Database className="w-6 h-6 text-[#58c8ff]" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Anonymous Metadata</h3>
                <p className="text-slate-400 leading-relaxed">
                  To improve detection, we may collect anonymous video signatures. This contains zero personally identifiable information (PII).
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 rounded-2xl">
            <h3 className="text-xl font-bold mb-6 flex items-center">
              <Key className="w-5 h-5 mr-3 text-[#58c8ff]" />
              Permissions Explained
            </h3>
            <div className="space-y-4 text-sm">
              <div className="pb-4 border-b border-white/10">
                <span className="font-bold text-[#58c8ff]">Read & Change data:</span>
                <p className="text-slate-400 mt-1">Needed to scan video elements on supported sites and inject the "ScrollSafe" badge overlay into the UI.</p>
              </div>
              <div className="pb-4">
                <span className="font-bold text-[#58c8ff]">Context Menus:</span>
                <p className="text-slate-400 mt-1">Allows you to manually trigger a re-scan or report detection errors via a simple right-click.</p>
              </div>
            </div>
            <a
              href={privacyPolicyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 w-full inline-flex justify-center py-3 px-4 bg-gradient-to-r from-[#2d7bff] to-[#58c8ff] text-white font-bold rounded-lg shadow-lg hover:opacity-90 transition-colors"
            >
              Read Full Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PrivacyTrust;
