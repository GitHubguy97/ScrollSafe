
import React from "react";
import { Mail, Bug, Map } from "lucide-react";

type SupportContactProps = {
  supportEmail: string;
  githubUrl: string;
};

const SupportContact: React.FC<SupportContactProps> = ({ supportEmail, githubUrl }) => {
  const issuesUrl = `${githubUrl.replace(/\/$/, "")}/issues`;

  return (
    <section id="support" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-teal-600 rounded-3xl p-8 md:p-12 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-teal-500 rounded-full blur-3xl opacity-50"></div>
          
          <div className="relative grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-bold text-white mb-6">Need help or have ideas?</h2>
                <p className="text-teal-50 text-lg leading-relaxed">
                  Email is the quickest way to reach us. Whether it's a bug report, platform request,
                  or security issue, drop a note and we'll respond fast.
                </p>
              </div>
              <div className="flex items-center space-x-3 text-white">
                <Mail className="w-5 h-5" />
                <a
                  href={`mailto:${supportEmail}`}
                  className="font-semibold underline underline-offset-4 decoration-white/60 hover:text-white"
                >
                  {supportEmail}
                </a>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center space-y-4 bg-white/5 border border-white/20 rounded-2xl p-8 text-white text-center">
              <p className="text-sm text-white/80">Prefer GitHub? File an issue:</p>
              <a
                href={issuesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-col items-center justify-center px-6 py-5 bg-white/10 backdrop-blur-sm border border-white/30 rounded-2xl text-white hover:bg-white/20 transition-all"
              >
                <Bug className="w-6 h-6 mb-3" />
                <span className="font-bold">Report a bug on GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SupportContact;
