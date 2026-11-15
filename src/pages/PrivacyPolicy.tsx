import LegalDocument from "@/components/LegalDocument";
import { PRIVACY_POLICY } from "@/lib/legalContent";

export default function PrivacyPolicy() {
  return (
    <LegalDocument
      doc={PRIVACY_POLICY}
      related={{ label: "Read our Terms and Conditions", to: "/terms-and-conditions" }}
    />
  );
}
