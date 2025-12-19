
import React from "react";
import { Github, Shield } from "lucide-react";

type FooterProps = {
  chromeStoreUrl: string;
  githubUrl: string;
  supportEmail: string;
  privacyPolicyUrl: string;
};

const Footer: React.FC<FooterProps> = ({
  chromeStoreUrl,
  githubUrl,
  supportEmail,
  privacyPolicyUrl,
}) => {
  return (
    <footer className="bg-slate-50 pt-16 pb-8 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center space-x-2 mb-6">
              <Shield className="w-6 h-6 text-teal-600" />
              <span className="text-lg font-bold tracking-tight text-slate-900">ScrollSafe</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed mb-6">
              The lightweight Chrome extension that helps you identify AI-generated video content while you scroll.
            </p>
            <div className="flex space-x-4">
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-900 transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 mb-6">Product</h4>
            <ul className="space-y-4 text-sm text-slate-500 font-medium">
              <li>
                <a 
                  href={chromeStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-teal-600 transition-colors"
                >
                  Chrome Web Store
                </a>
              </li>
              <li><a href="#how-it-works" className="hover:text-teal-600 transition-colors">How it works</a></li>
              <li><a href="#faq" className="hover:text-teal-600 transition-colors">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-slate-500 font-medium">
              <li>
                <a
                  href={privacyPolicyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-teal-600 transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-teal-600 transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 mb-6">Support</h4>
            <ul className="space-y-2 text-sm text-slate-500 font-medium">
              <li>Email us any time:</li>
              <li>
                <a href={`mailto:${supportEmail}`} className="hover:text-teal-600 transition-colors">
                  {supportEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center text-xs text-slate-400 font-medium">
          <p>&copy; {new Date().getFullYear()} ScrollSafe. All rights reserved.</p>
          <p className="mt-4 md:mt-0">Built with privacy and truth in mind.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
