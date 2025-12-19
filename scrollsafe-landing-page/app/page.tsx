
import Navbar from "../components/Navbar";
import Hero from "../components/Hero";
import TrustStrip from "../components/TrustStrip";
import ProblemSolution from "../components/ProblemSolution";
import HowItWorks from "../components/HowItWorks";
import SupportedPlatforms from "../components/SupportedPlatforms";
import PrivacyTrust from "../components/PrivacyTrust";
import DemoSection from "../components/DemoSection";
import FAQ from "../components/FAQ";
import SupportContact from "../components/SupportContact";
import Footer from "../components/Footer";
import { getSiteConfig } from "../lib/siteConfig";

export default async function LandingPage() {
  const config = await getSiteConfig();
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar chromeStoreUrl={config.chromeStoreUrl} githubUrl={config.githubUrl} />
      <main className="flex-grow">
        <Hero
          chromeStoreUrl={config.chromeStoreUrl}
          demoUrl={config.demoUrl}
          heroMediaUrl={config.heroDemoGifUrl}
        />
        <TrustStrip />
        <ProblemSolution />
        <HowItWorks />
        <SupportedPlatforms />
        <PrivacyTrust privacyPolicyUrl={config.privacyPolicyUrl} />
        <DemoSection demoUrl={config.demoUrl} />
        <FAQ />
        <SupportContact supportEmail={config.supportEmail} githubUrl={config.githubUrl} />
      </main>
      <Footer
        chromeStoreUrl={config.chromeStoreUrl}
        githubUrl={config.githubUrl}
        supportEmail={config.supportEmail}
        privacyPolicyUrl={config.privacyPolicyUrl}
      />
    </div>
  );
}
