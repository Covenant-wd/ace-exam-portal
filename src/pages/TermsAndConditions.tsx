import LegalDocument from "@/components/LegalDocument";
import { TERMS_AND_CONDITIONS } from "@/lib/legalContent";

export default function TermsAndConditions() {
  return (
    <LegalDocument
      doc={TERMS_AND_CONDITIONS}
      related={{ label: "Read our Privacy Policy", to: "/privacy-policy" }}
    />
  );
}
