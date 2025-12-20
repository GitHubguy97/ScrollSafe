
import React from "react";
import { Github } from "lucide-react";
import BrandBadge from "./BrandBadge";

type NavbarProps = {
  chromeStoreUrl: string;
  githubUrl: string;
};

const Navbar: React.FC<NavbarProps> = ({ chromeStoreUrl, githubUrl }) => {
  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <BrandBadge className="w-10 h-10" />
            <span className="text-xl font-bold tracking-tight text-slate-900">ScrollSafe</span>
          </div>
          
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-600">
            <a href="#how-it-works" className="hover:text-[#2d7bff] transition-colors">How it works</a>
            <a href="#privacy" className="hover:text-[#2d7bff] transition-colors">Privacy</a>
            <a href="#faq" className="hover:text-[#2d7bff] transition-colors">FAQ</a>
            <a href="#support" className="hover:text-[#2d7bff] transition-colors">Support</a>
          </div>

          <div className="flex items-center">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="hidden sm:inline-flex mr-3 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
            <a
              href={chromeStoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gradient-to-r from-[#2d7bff] to-[#5bc6ff] text-white px-5 py-2 rounded-full text-sm font-semibold hover:shadow-lg transition-all inline-block"
            >
              Install on Chrome
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
