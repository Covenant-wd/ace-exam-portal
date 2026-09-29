// ─────────────────────────────────────────────────────────────────────────────
// Academia HQ — legal documents (Privacy Policy + Terms and Conditions)
//
// Single source of truth for:
//   • the text rendered at /privacy-policy and /terms-and-conditions
//   • the version stamp saved with every school registration
//
// When you change the wording of either document, bump LEGAL_VERSION and
// LEGAL_EFFECTIVE_DATE below. Each registration stores the version the school
// accepted, so you can always tell which text a school agreed to.
// ─────────────────────────────────────────────────────────────────────────────

export const LEGAL_VERSION = "2026-09-19";
export const LEGAL_EFFECTIVE_DATE = "19 September 2026";

export const CONTACT = {
  name: "Academia HQ",
  website: "https://academiahq.pro",
  email: "support@academiahq.pro",
  phone: "+234-903-958-0317",
};

// ── Types ────────────────────────────────────────────────────────────────────

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; text: string }
  | { type: "contact" };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentData {
  title: string;
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
}

// ── Privacy Policy ───────────────────────────────────────────────────────────

export const PRIVACY_POLICY: LegalDocumentData = {
  title: "Privacy Policy",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro: [
    "Academia HQ (“Academia HQ”, “we”, “us”, or “our”) respects the privacy of schools, administrators, teachers, students, parents, guardians, and other users of our platform.",
    "This Privacy Policy explains how Academia HQ collects, uses, stores, protects, and manages personal information when you access or use our website, school management platform, CBT services, and related services.",
    "By using Academia HQ, you acknowledge that you have read and understood this Privacy Policy.",
  ],
  sections: [
    {
      title: "Information We Collect",
      blocks: [
        { type: "p", text: "Depending on how you use Academia HQ, we may collect the following categories of information:" },
        { type: "h3", text: "1.1 School Information" },
        { type: "p", text: "We may collect information relating to schools that register or subscribe to Academia HQ, including:" },
        {
          type: "ul",
          items: [
            "School name",
            "School address",
            "School contact details",
            "School email address",
            "Telephone numbers",
            "School administrator information",
            "Subscription and account information",
            "Information required for billing and account management",
          ],
        },
        { type: "h3", text: "1.2 Administrator and Staff Information" },
        { type: "p", text: "We may collect information relating to school administrators, teachers, and other authorised staff members, including:" },
        {
          type: "ul",
          items: [
            "Name",
            "Email address",
            "Telephone number",
            "Username",
            "Login credentials",
            "Assigned role or position",
            "Subjects or classes assigned to the staff member",
            "Attendance and activity records relating to use of the platform",
          ],
        },
        { type: "h3", text: "1.3 Student Information" },
        { type: "p", text: "Where a school uses Academia HQ to manage student records, the school may provide information such as:" },
        {
          type: "ul",
          items: [
            "Student name",
            "Student identification number",
            "Class and arm",
            "Gender where required by the school",
            "Date of birth where required",
            "Academic records",
            "Examination results",
            "Attendance records",
            "Behavioural, affective, and psychomotor assessment records",
            "School fees and payment related records",
            "Other information reasonably required for the administration of the student’s education",
          ],
        },
        { type: "p", text: "Academia HQ does not require schools to provide information that is unnecessary for the services being used." },
        { type: "h3", text: "1.4 Parent and Guardian Information" },
        { type: "p", text: "Where the platform supports parent or guardian access, we may process information such as:" },
        {
          type: "ul",
          items: [
            "Parent or guardian name",
            "Contact information",
            "Student relationship",
            "Login information",
            "Information required to provide access to relevant student records",
          ],
        },
        { type: "h3", text: "1.5 Technical Information" },
        { type: "p", text: "When you use our website or platform, certain technical information may be automatically collected, including:" },
        {
          type: "ul",
          items: [
            "IP address",
            "Browser type",
            "Device information",
            "Operating system",
            "Login and access times",
            "Pages or features accessed",
            "Error logs",
            "Security and authentication information",
          ],
        },
        { type: "p", text: "This information may be used to maintain platform security, diagnose technical problems, improve performance, and prevent misuse." },
      ],
    },
    {
      title: "How We Use Personal Information",
      blocks: [
        { type: "p", text: "Academia HQ may use personal information for purposes including:" },
        {
          type: "ul",
          items: [
            "Providing and maintaining the Academia HQ platform",
            "Creating and managing school accounts",
            "Providing school management services",
            "Managing student and staff records",
            "Processing examination and assessment information",
            "Generating academic reports and results",
            "Providing authorised parents or guardians with relevant information",
            "Managing subscriptions and billing",
            "Communicating with schools and authorised users",
            "Providing technical support",
            "Detecting and preventing unauthorised access",
            "Maintaining the security of the platform",
            "Improving our services",
            "Investigating technical problems and misuse",
            "Complying with applicable legal and regulatory requirements",
          ],
        },
      ],
    },
    {
      title: "School Responsibility for Student Data",
      blocks: [
        { type: "p", text: "Schools using Academia HQ are responsible for ensuring that they have the appropriate authority and lawful basis to collect and provide student, parent, teacher, and other personal information to Academia HQ." },
        { type: "p", text: "Where Academia HQ processes student information on behalf of a school, the school remains responsible for determining the purposes for which the information is collected and used, subject to applicable data protection law." },
        { type: "p", text: "Academia HQ will process school supplied information only for legitimate purposes connected with providing and improving the contracted services, or as otherwise permitted or required by law." },
      ],
    },
    {
      title: "Legal Basis for Processing",
      blocks: [
        { type: "p", text: "Where applicable, Academia HQ may process personal information based on one or more lawful grounds recognised under applicable data protection law, including:" },
        {
          type: "ul",
          items: [
            "Consent",
            "Performance of a contract",
            "Compliance with a legal obligation",
            "Protection of vital interests",
            "Performance of a task carried out in the public interest",
            "Legitimate interests, where applicable and where those interests do not override the rights of the data subject",
          ],
        },
        { type: "p", text: "The Nigeria Data Protection Commission identifies lawful processing and data subject rights as important components of the Nigerian data protection framework." },
      ],
    },
    {
      title: "Information Relating to Children and Students",
      blocks: [
        { type: "p", text: "Academia HQ provides services that may involve the processing of information relating to students, including children and other minors." },
        { type: "p", text: "Schools and authorised users must ensure that information relating to students is collected and provided to Academia HQ in accordance with applicable laws and school policies." },
        { type: "p", text: "Where consent or another specific legal basis is required for processing information relating to a minor, the responsible school or authorised party must ensure that the necessary requirements have been satisfied." },
        { type: "p", text: "Academia HQ does not intentionally use student information for unrelated advertising or commercial profiling." },
      ],
    },
    {
      title: "Sharing of Personal Information",
      blocks: [
        { type: "p", text: "Academia HQ does not sell users’ personal information." },
        { type: "p", text: "We may share or provide access to personal information where reasonably necessary to:" },
        {
          type: "ul",
          items: [
            "Provide the requested services",
            "Operate and maintain the platform",
            "Provide technical and infrastructure services",
            "Process payments",
            "Maintain security",
            "Comply with legal obligations",
            "Respond to lawful requests from competent authorities",
            "Protect the rights, property, or security of Academia HQ, our users, or others",
          ],
        },
        { type: "p", text: "Third party service providers may only receive information reasonably necessary for the services they provide to Academia HQ and may be subject to contractual or legal obligations concerning data protection." },
      ],
    },
    {
      title: "Payment Information",
      blocks: [
        { type: "p", text: "Where payments are made for Academia HQ subscriptions, payment information may be processed through authorised payment service providers." },
        { type: "p", text: "Academia HQ may retain information necessary to confirm and administer transactions, such as payment status, transaction reference, subscription period, amount paid, and invoice information." },
        { type: "p", text: "Where payment card or other sensitive payment credentials are processed directly by a third party payment provider, Academia HQ may not have access to the complete payment credentials." },
      ],
    },
    {
      title: "Data Security",
      blocks: [
        { type: "p", text: "Academia HQ takes reasonable technical and organisational measures to protect personal information against unauthorised access, alteration, disclosure, loss, misuse, or destruction." },
        { type: "p", text: "Security measures may include:" },
        {
          type: "ul",
          items: [
            "Authentication and access controls",
            "Role based access",
            "Secure transmission where supported",
            "Monitoring and logging",
            "Password protection",
            "Restricted administrative access",
            "Technical safeguards against unauthorised access",
          ],
        },
        { type: "p", text: "However, no internet based system can be guaranteed to be completely secure." },
        { type: "p", text: "Users are responsible for keeping their login credentials confidential and must notify Academia HQ if they believe their account has been compromised." },
      ],
    },
    {
      title: "Data Retention",
      blocks: [
        { type: "p", text: "Academia HQ may retain personal information for as long as reasonably necessary to:" },
        {
          type: "ul",
          items: [
            "Provide the services",
            "Maintain school records",
            "Meet contractual obligations",
            "Resolve disputes",
            "Maintain security records",
            "Comply with legal or regulatory requirements",
            "Establish, exercise, or defend legal claims",
          ],
        },
        { type: "p", text: "When personal information is no longer reasonably required, it may be deleted, anonymised, or securely disposed of, subject to applicable legal and operational requirements." },
      ],
    },
    {
      title: "Cookies and Similar Technologies",
      blocks: [
        { type: "p", text: "Academia HQ may use cookies and similar technologies to support essential website functionality, maintain sessions, remember preferences, improve security, and understand how users interact with the platform." },
        { type: "p", text: "Where consent is legally required for particular cookies or similar technologies, Academia HQ will provide an appropriate mechanism for obtaining and managing that consent." },
      ],
    },
    {
      title: "Third Party Services",
      blocks: [
        { type: "p", text: "Academia HQ may use third party services for functions such as:" },
        {
          type: "ul",
          items: [
            "Cloud infrastructure",
            "Email delivery",
            "Payment processing",
            "Authentication",
            "Analytics",
            "Security",
            "Communication",
          ],
        },
        { type: "p", text: "These providers may process information on behalf of Academia HQ or provide services that require limited information processing." },
        { type: "p", text: "Where appropriate, Academia HQ will take reasonable steps to ensure that third party service providers handle information in accordance with applicable data protection requirements." },
      ],
    },
    {
      title: "International Data Transfers",
      blocks: [
        { type: "p", text: "Some service providers used by Academia HQ may process or store information outside Nigeria." },
        { type: "p", text: "Where personal information is transferred internationally, Academia HQ will take reasonable steps to ensure that the transfer and subsequent processing comply with applicable data protection requirements." },
      ],
    },
    {
      title: "Your Data Protection Rights",
      blocks: [
        { type: "p", text: "Subject to applicable law and relevant conditions, data subjects may have rights including:" },
        {
          type: "ul",
          items: [
            "The right to be informed",
            "The right to access personal information",
            "The right to request correction of inaccurate information",
            "The right to object to certain processing",
            "The right to request restriction of processing in applicable circumstances",
            "The right to request deletion or erasure where legally applicable",
            "The right to data portability where applicable",
            "The right to withdraw consent where processing is based on consent",
            "The right to lodge a complaint with the appropriate data protection authority",
          ],
        },
        { type: "p", text: "The Nigeria Data Protection Commission identifies these rights among the rights available to data subjects under the Nigerian data protection framework." },
        { type: "p", text: "Where a request relates to information supplied and controlled by a school, Academia HQ may direct the request to the relevant school where appropriate." },
      ],
    },
    {
      title: "Accuracy of Information",
      blocks: [
        { type: "p", text: "Schools and authorised users are responsible for ensuring that information supplied to Academia HQ is accurate, complete, and reasonably up to date." },
        { type: "p", text: "If incorrect information is identified, the relevant authorised user or school administrator should request its correction." },
      ],
    },
    {
      title: "Account Security",
      blocks: [
        { type: "p", text: "Users must:" },
        {
          type: "ul",
          items: [
            "Keep their login credentials confidential",
            "Avoid sharing accounts",
            "Use appropriate passwords",
            "Log out from shared devices",
            "Immediately report suspected unauthorised access",
          ],
        },
        { type: "p", text: "Academia HQ may restrict or suspend access where there is reasonable evidence of account compromise, misuse, or a security threat." },
      ],
    },
    {
      title: "Data Breaches and Security Incidents",
      blocks: [
        { type: "p", text: "Where Academia HQ becomes aware of a security incident involving personal information, we will take reasonable steps to investigate, contain, and remediate the incident and make any notifications required by applicable law." },
      ],
    },
    {
      title: "Changes to This Privacy Policy",
      blocks: [
        { type: "p", text: "Academia HQ may update this Privacy Policy from time to time to reflect changes in our services, technology, legal requirements, or data processing practices." },
        { type: "p", text: "The updated version will be published on the Academia HQ website with a revised effective date where appropriate." },
      ],
    },
    {
      title: "Contact Us",
      blocks: [
        { type: "p", text: "For questions, concerns, privacy requests, or complaints relating to this Privacy Policy, please contact:" },
        { type: "contact" },
      ],
    },
    {
      title: "Acceptance",
      blocks: [
        { type: "p", text: "By accessing or using Academia HQ, you acknowledge that you have had the opportunity to read this Privacy Policy." },
        { type: "p", text: "Where specific consent is required by applicable law, Academia HQ will request that consent through an appropriate mechanism." },
      ],
    },
  ],
};

// ── Terms and Conditions ─────────────────────────────────────────────────────

export const TERMS_AND_CONDITIONS: LegalDocumentData = {
  title: "Terms and Conditions",
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  intro: [
    "Welcome to Academia HQ.",
    "These Terms and Conditions (“Terms”) govern access to and use of the Academia HQ platform, website, school management services, CBT services, and related products and services.",
    "By registering a school account, subscribing to Academia HQ, accessing the platform, or using any Academia HQ service, you agree to be bound by these Terms.",
    "If you are accepting these Terms on behalf of a school or organisation, you confirm that you have the authority to do so.",
  ],
  sections: [
    {
      title: "About Academia HQ",
      blocks: [
        { type: "p", text: "Academia HQ is a digital school management and educational technology platform designed to assist schools with the administration and management of academic and school related activities." },
        { type: "p", text: "Depending on the school’s subscription and the services made available to it, Academia HQ may provide features including:" },
        {
          type: "ul",
          items: [
            "Student management",
            "Teacher and staff management",
            "Academic records",
            "Student results",
            "Attendance management",
            "School fees and debtor management",
            "Examination and assessment management",
            "Computer based assessments",
            "Parent access",
            "Notifications",
            "Digital report cards",
            "Lesson and academic resources",
            "Other educational technology services introduced by Academia HQ",
          ],
        },
        { type: "p", text: "Specific features may vary according to the school’s subscription, configuration, or service plan." },
      ],
    },
    {
      title: "School Accounts",
      blocks: [
        { type: "p", text: "A school may be required to create an account before accessing certain Academia HQ services." },
        { type: "p", text: "The school is responsible for:" },
        {
          type: "ul",
          items: [
            "Providing accurate registration information",
            "Maintaining the confidentiality of account credentials",
            "Controlling access to authorised staff",
            "Ensuring that users assigned to the account are authorised",
            "Ensuring that information entered into the platform is accurate",
            "Immediately reporting suspected unauthorised access",
          ],
        },
        { type: "p", text: "Academia HQ reserves the right to suspend or restrict an account where necessary to protect the platform, users, school information, or other legitimate interests." },
      ],
    },
    {
      title: "User Roles and Permissions",
      blocks: [
        { type: "p", text: "Academia HQ may provide different user roles, including administrators, teachers, students, parents, and other authorised users." },
        { type: "p", text: "Each role may have different permissions." },
        { type: "p", text: "Schools are responsible for assigning appropriate permissions and ensuring that users only access information necessary for their roles." },
        { type: "p", text: "Schools must not intentionally provide users with access to information they are not authorised to view." },
      ],
    },
    {
      title: "School Data",
      blocks: [
        { type: "p", text: "The school retains responsibility for the information it enters into Academia HQ." },
        { type: "p", text: "This may include student records, academic results, attendance information, teacher records, parent information, and other school related information." },
        { type: "p", text: "Academia HQ provides the technological infrastructure for managing such information and will handle it in accordance with its Privacy Policy and applicable data protection requirements." },
      ],
    },
    {
      title: "Subscription and Payment Terms",
      blocks: [
        { type: "p", text: "Academia HQ operates a student based, termly billing model." },
        { type: "p", text: "Schools are billed according to the number of students covered by their subscription for the applicable academic term." },
        { type: "p", text: "Each academic term constitutes a separate billing period." },
        { type: "p", text: "The applicable amount payable by a school will depend on the number of students included in the school’s subscription and the current price communicated by Academia HQ." },
        { type: "p", text: "The applicable price may be communicated through an official invoice, quotation, subscription agreement, onboarding communication, or other official communication from Academia HQ." },
      ],
    },
    {
      title: "Student Based Billing",
      blocks: [
        { type: "p", text: "Unless otherwise agreed in writing, the subscription fee is calculated based on the number of students covered by the school’s subscription for the applicable term." },
        { type: "p", text: "For example, where the applicable rate is calculated per student per term, the amount payable will generally be determined by:" },
        { type: "callout", text: "Number of billable students × applicable fee per student per term." },
        { type: "p", text: "Academia HQ may establish rules for determining which student records are included in the billable student count." },
        { type: "p", text: "Any special pricing, discounts, promotional rates, minimum student requirements, or negotiated arrangements will apply only where expressly communicated or agreed by Academia HQ." },
      ],
    },
    {
      title: "Payment Due Date",
      blocks: [
        { type: "p", text: "The payment due date will be stated on the applicable invoice, quotation, subscription agreement, or official payment communication." },
        { type: "p", text: "Schools are responsible for ensuring that subscription fees are paid by the applicable due date." },
        { type: "p", text: "Failure to make payment when due may result in restricted access to some or all Academia HQ services." },
      ],
    },
    {
      title: "Suspension for Non Payment",
      blocks: [
        { type: "p", text: "Where a school’s subscription fee remains unpaid after the applicable payment deadline, Academia HQ may:" },
        {
          type: "ul",
          items: [
            "Restrict access to certain platform features",
            "Restrict access to the school’s account",
            "Prevent the creation of new records",
            "Restrict access to certain assessment or management functions",
            "Suspend the school’s subscription",
            "Require outstanding fees to be settled before restoring full access",
          ],
        },
        { type: "p", text: "Academia HQ will make reasonable efforts to notify the school before or around the time of a suspension where practicable." },
      ],
    },
    {
      title: "Restoration After Payment",
      blocks: [
        { type: "p", text: "Where access has been restricted because of unpaid subscription fees, access may be restored after Academia HQ confirms the outstanding payment." },
        { type: "p", text: "Restoration may not be immediate where technical, administrative, banking, or payment verification processes are required." },
      ],
    },
    {
      title: "Refunds and Cancellation",
      blocks: [
        { type: "p", text: "Subscription payments are generally non refundable after the applicable subscription has been activated or services for the relevant term have been made available, except where:" },
        {
          type: "ul",
          items: [
            "Academia HQ expressly agrees to a refund",
            "A refund is required by applicable law",
            "A duplicate or erroneous payment has been confirmed",
            "A specific written agreement provides otherwise",
          ],
        },
        { type: "p", text: "Cancellation of a school’s subscription does not automatically create a right to a refund for a term that has already commenced." },
        { type: "p", text: "Any refund approved by Academia HQ will be processed in accordance with the applicable refund arrangement." },
      ],
    },
    {
      title: "Changes to Pricing",
      blocks: [
        { type: "p", text: "Academia HQ may change its subscription pricing from time to time." },
        { type: "p", text: "Where a price change affects a school’s future subscription period, Academia HQ will communicate the applicable pricing before or during the relevant renewal or billing process where reasonably practicable." },
        { type: "p", text: "A price change will not automatically alter a previously issued invoice unless otherwise agreed." },
      ],
    },
    {
      title: "Invoices and Payment Records",
      blocks: [
        { type: "p", text: "Academia HQ may issue invoices, receipts, payment confirmations, or other transaction records for subscription payments." },
        { type: "p", text: "Schools are responsible for reviewing their invoices and notifying Academia HQ promptly if they identify an apparent billing error." },
      ],
    },
    {
      title: "Acceptable Use",
      blocks: [
        { type: "p", text: "Users must not use Academia HQ to:" },
        {
          type: "ul",
          items: [
            "Violate applicable laws or regulations",
            "Gain unauthorised access to another account",
            "Attempt to bypass security controls",
            "Introduce malicious software",
            "Interfere with the operation of the platform",
            "Access information without authorisation",
            "Misrepresent their identity",
            "Abuse platform resources",
            "Copy, reproduce, or redistribute proprietary platform components without permission",
            "Use the platform for activities unrelated to legitimate educational or school administration purposes where such use creates security, legal, or operational risks",
          ],
        },
        { type: "p", text: "Academia HQ may investigate suspected misuse and take appropriate action." },
      ],
    },
    {
      title: "Student and Academic Records",
      blocks: [
        { type: "p", text: "Academia HQ provides tools for managing academic information, but schools remain responsible for verifying the accuracy of information entered into the platform." },
        { type: "p", text: "Schools are responsible for reviewing student results, grades, attendance information, fees, and other records before communicating or publishing them." },
        { type: "p", text: "Academia HQ does not guarantee that information entered incorrectly by a school will automatically be detected or corrected." },
      ],
    },
    {
      title: "Examination and Assessment Services",
      blocks: [
        { type: "p", text: "Where Academia HQ provides examination or computer based assessment functionality, the school is responsible for:" },
        {
          type: "ul",
          items: [
            "Creating or approving appropriate assessment content",
            "Assigning assessments correctly",
            "Ensuring that students receive appropriate access",
            "Reviewing submitted results",
            "Maintaining appropriate examination procedures",
            "Ensuring that assessment content does not violate applicable laws or third party rights",
          ],
        },
        { type: "p", text: "Academia HQ provides the technological infrastructure and does not guarantee any particular academic result or examination outcome." },
      ],
    },
    {
      title: "Platform Availability",
      blocks: [
        { type: "p", text: "Academia HQ aims to maintain reliable and accessible services." },
        { type: "p", text: "However, uninterrupted availability cannot be guaranteed." },
        { type: "p", text: "The platform may occasionally be unavailable because of:" },
        {
          type: "ul",
          items: [
            "Scheduled maintenance",
            "Software updates",
            "Infrastructure problems",
            "Internet connectivity issues",
            "Third party service interruptions",
            "Security incidents",
            "Events beyond Academia HQ’s reasonable control",
          ],
        },
        { type: "p", text: "Academia HQ will take reasonable steps to restore affected services where practicable." },
      ],
    },
    {
      title: "Third Party Services",
      blocks: [
        { type: "p", text: "Academia HQ may integrate with third party services including payment providers, email services, cloud infrastructure providers, authentication services, analytics providers, or other technology providers." },
        { type: "p", text: "The availability and operation of third party services may be subject to the terms and policies of those providers." },
        { type: "p", text: "Academia HQ is not responsible for interruptions or failures caused solely by third party services beyond its reasonable control." },
      ],
    },
    {
      title: "Intellectual Property",
      blocks: [
        { type: "p", text: "The Academia HQ platform, software, branding, designs, interfaces, logos, documentation, and other materials developed or provided by Academia HQ remain the property of Academia HQ or its relevant licensors unless otherwise stated." },
        { type: "p", text: "A school receives a limited, non exclusive, non transferable right to use the platform during its active subscription solely for its legitimate educational and administrative purposes." },
        { type: "p", text: "The school does not acquire ownership of Academia HQ’s software or intellectual property by subscribing to the platform." },
      ],
    },
    {
      title: "School Content",
      blocks: [
        { type: "p", text: "Schools retain responsibility for content and information they upload or enter into Academia HQ." },
        { type: "p", text: "The school confirms that it has the necessary rights and authority to use such information and provide it to Academia HQ for processing." },
        { type: "p", text: "The school must not upload content that unlawfully infringes another person’s rights or violates applicable laws." },
      ],
    },
    {
      title: "Account Termination",
      blocks: [
        { type: "p", text: "Academia HQ or a school may terminate the subscription subject to any applicable agreement." },
        { type: "p", text: "Academia HQ may suspend or terminate access where:" },
        {
          type: "ul",
          items: [
            "Subscription fees remain unpaid",
            "The account is used unlawfully",
            "The platform is deliberately abused",
            "There is a serious security risk",
            "The user materially breaches these Terms",
            "Continued access creates a significant risk to Academia HQ or other users",
          ],
        },
        { type: "p", text: "Where appropriate, Academia HQ may provide the school with an opportunity to resolve a breach before termination." },
      ],
    },
    {
      title: "Effect of Termination",
      blocks: [
        { type: "p", text: "Upon termination or expiration of a subscription, the school’s access to Academia HQ may be disabled." },
        { type: "p", text: "Academia HQ will handle school information in accordance with its Privacy Policy, applicable agreements, and applicable data protection requirements." },
        { type: "p", text: "Where appropriate and technically feasible, Academia HQ may provide reasonable arrangements for the school to retrieve its information before permanent deletion, subject to any applicable legal, security, or operational requirements." },
      ],
    },
    {
      title: "Disclaimer",
      blocks: [
        { type: "p", text: "Academia HQ provides technology intended to support school administration and educational activities." },
        { type: "p", text: "The platform should not be considered a substitute for professional educational judgment, school policies, legal advice, accounting advice, or regulatory guidance." },
        { type: "p", text: "Schools remain responsible for decisions made using information generated or stored through the platform." },
      ],
    },
    {
      title: "Limitation of Liability",
      blocks: [
        { type: "p", text: "To the extent permitted by applicable law, Academia HQ will not be liable for indirect, incidental, special, or consequential losses arising from the use of the platform." },
        { type: "p", text: "Nothing in these Terms is intended to exclude or limit liability that cannot lawfully be excluded or limited under applicable law." },
      ],
    },
    {
      title: "Indemnity",
      blocks: [
        { type: "p", text: "To the extent permitted by applicable law, a school agrees to take responsibility for claims arising from its unlawful use of Academia HQ, unauthorised use of student or third party information, violation of these Terms, or content uploaded by the school." },
      ],
    },
    {
      title: "Changes to These Terms",
      blocks: [
        { type: "p", text: "Academia HQ may update these Terms from time to time to reflect changes in its services, pricing structure, technology, legal requirements, or business operations." },
        { type: "p", text: "Where material changes are made, Academia HQ may provide notice through the platform, email, website, or another appropriate communication method." },
        { type: "p", text: "Continued use of the platform after the effective date of updated Terms may constitute acceptance of the revised Terms where permitted by applicable law." },
      ],
    },
    {
      title: "Governing Law",
      blocks: [
        { type: "p", text: "These Terms shall be governed by the applicable laws of the Federal Republic of Nigeria." },
        { type: "p", text: "Any dispute arising from the use of Academia HQ shall be addressed in accordance with applicable Nigerian law and any applicable contractual dispute resolution provisions agreed between Academia HQ and the school." },
      ],
    },
    {
      title: "Contact Information",
      blocks: [
        { type: "p", text: "For questions relating to these Terms and Conditions, subscription, billing, or the use of Academia HQ, contact:" },
        { type: "contact" },
      ],
    },
    {
      title: "Acceptance of These Terms",
      blocks: [
        { type: "p", text: "By registering an account, subscribing to Academia HQ, accessing the platform, or continuing to use the services, the school and its authorised users acknowledge that they have read, understood, and agreed to these Terms and Conditions." },
      ],
    },
  ],
};
