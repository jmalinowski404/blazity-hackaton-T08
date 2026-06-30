import { Topbar } from "@/components/Topbar";
import { Hero } from "@/components/Hero";
import { BrandCheckApp } from "@/components/BrandCheckApp";
import { HowItWorks } from "@/components/HowItWorks";
import { VoiceProfile } from "@/components/VoiceProfile";
import { SiteFooter } from "@/components/SiteFooter";

export default function Home() {
  return (
    <>
      <Topbar />
      <main>
        <Hero />
        <BrandCheckApp />
        <HowItWorks />
        <VoiceProfile />
      </main>
      <SiteFooter />
    </>
  );
}
