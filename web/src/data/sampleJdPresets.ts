// Sample Job Description Presets
//
// Fictional sample job descriptions for first-time visitors and candidates to immediately
// explore Curevo AI's ATS match analysis, gap resolution, and resume tailoring workflows.
//
// Strictly fictional roles; generic employer placeholders; never live vacancies.

export interface SampleJdPreset {
  id: 'backend-engineer' | 'frontend-engineer' | 'devops-engineer';
  title: string;
  roleTitle: string;
  badge: string;
  summary: string;
  isSample: true;
  sampleNotice: string;
  jobText: string;
}

export const SAMPLE_JD_PRESETS: SampleJdPreset[] = [
  {
    id: 'backend-engineer',
    title: 'Backend Software Engineer',
    roleTitle: 'Backend Software Engineer',
    badge: 'Backend / APIs',
    summary: 'High-performance microservices, REST APIs, PostgreSQL schemas, and distributed data pipelines.',
    isSample: true,
    sampleNotice: 'Sample job description (fictional role for ATS matching exploration). Not a live job posting.',
    jobText: `[Sample Job Description — Fictional Role for ATS Matching Exploration]
Title: Backend Software Engineer
Company: CloudScale Systems Ltd (Fictional Sample Employer)

Role Overview:
We are seeking a Backend Software Engineer to design, build, and maintain high-performance microservices, REST APIs, and scalable distributed data pipelines.

Key Responsibilities:
• Design, develop, and deploy scalable backend services and microservices using Go, Python, or Node.js.
• Architect and optimize relational and NoSQL database schemas using PostgreSQL and Redis.
• Implement robust API authentication, rate limiting, and observability across all endpoints.
• Collaborate with frontend and DevOps engineers to ship reliable features with comprehensive automated testing.
• Troubleshoot production performance bottlenecks, optimize database query latency, and conduct blameless post-mortems.

Required Qualifications:
• 3+ years of professional backend software engineering experience using Go, Python, Node.js, or Java.
• Strong proficiency in SQL and relational database design (PostgreSQL or MySQL).
• Hands-on experience building RESTful APIs and distributed microservices architectures.
• Solid understanding of Docker containerization, Git version control, and automated CI/CD pipelines.
• Bachelor's degree in Computer Science, Software Engineering, or equivalent practical experience.

Preferred Qualifications:
• Experience with Redis caching and asynchronous message queues such as Kafka or RabbitMQ.
• Familiarity with cloud platforms (AWS or GCP) and Kubernetes container orchestration.
• Working knowledge of GraphQL, gRPC, or event-driven distributed architectures.
• Experience with monitoring and telemetry tools like Prometheus, Grafana, or Datadog.`,
  },
  {
    id: 'frontend-engineer',
    title: 'Frontend Software Engineer',
    roleTitle: 'Frontend Software Engineer',
    badge: 'Frontend / UI',
    summary: 'Responsive React and TypeScript applications, Tailwind CSS, design systems, and web performance.',
    isSample: true,
    sampleNotice: 'Sample job description (fictional role for ATS matching exploration). Not a live job posting.',
    jobText: `[Sample Job Description — Fictional Role for ATS Matching Exploration]
Title: Frontend Software Engineer
Company: Interface Labs Inc (Fictional Sample Employer)

Role Overview:
We are looking for a Frontend Software Engineer to craft responsive, accessible, and high-performance web applications that provide seamless user experiences across devices.

Key Responsibilities:
• Build modern, interactive user interfaces using React, TypeScript, and modern CSS frameworks (Tailwind CSS).
• Implement client-side state management, responsive layouts, and cross-browser compatibility.
• Ensure web accessibility (WCAG 2.1 AA compliance) and semantic HTML structure across all application views.
• Optimize core web vitals, bundle size, render performance, and page load speeds.
• Partner closely with product designers, UX researchers, and backend engineers to translate wireframes into intuitive user flows.
• Maintain and extend reusable design system component libraries with comprehensive unit and visual regression tests.

Required Qualifications:
• 3+ years of experience in modern frontend development using React and TypeScript.
• Strong proficiency in JavaScript (ES6+), HTML5, CSS3, and responsive layout systems.
• Practical experience with modern CSS tooling such as Tailwind CSS or CSS Modules.
• Working knowledge of client-side routing, RESTful API integration, and asynchronous data fetching.
• Familiarity with frontend automated testing using Vitest, Jest, or React Testing Library.

Preferred Qualifications:
• Experience with Next.js, SSR/SSG rendering patterns, and web performance optimization.
• Understanding of GraphQL client caching (Apollo Client or TanStack Query).
• Experience maintaining shared design systems or UI component libraries.
• Knowledge of browser security standards (Content Security Policy, CORS, XSS mitigation).`,
  },
  {
    id: 'devops-engineer',
    title: 'DevOps / Cloud Engineer',
    roleTitle: 'DevOps / Cloud Engineer',
    badge: 'Cloud / Infrastructure',
    summary: 'Multi-environment AWS/GCP cloud infrastructure, Terraform IaC, Kubernetes, and CI/CD pipelines.',
    isSample: true,
    sampleNotice: 'Sample job description (fictional role for ATS matching exploration). Not a live job posting.',
    jobText: `[Sample Job Description — Fictional Role for ATS Matching Exploration]
Title: DevOps / Cloud Engineer
Company: CloudNexus Infrastructure Ltd (Fictional Sample Employer)

Role Overview:
We are seeking a DevOps / Cloud Engineer to manage reliable cloud infrastructure, automate deployment pipelines, and strengthen system observability and resilience.

Key Responsibilities:
• Provision, configure, and maintain secure multi-environment cloud infrastructure on AWS or GCP using Infrastructure as Code (Terraform).
• Build and optimize automated CI/CD deployment pipelines using GitHub Actions, GitLab CI, or Jenkins.
• Administer and scale containerized workloads using Kubernetes (EKS / GKE) and Docker.
• Implement distributed system observability, log aggregation, and real-time alerting using Prometheus, Grafana, and ELK stack.
• Partner with software development teams to enforce security best practices, secrets management, and automated disaster recovery.
• Monitor cloud infrastructure spend, optimize resource utilization, and maintain 99.99% service availability SLAs.

Required Qualifications:
• 3+ years of professional experience in DevOps, Site Reliability Engineering (SRE), or Cloud Engineering.
• Strong proficiency with AWS or GCP cloud services, IAM security, and networking.
• Hands-on experience with Infrastructure as Code using Terraform or CloudFormation.
• Proven experience deploying and managing production Kubernetes clusters and Docker containers.
• Deep expertise in CI/CD automation and Linux system administration.

Preferred Qualifications:
• Relevant cloud certifications such as AWS Certified Solutions Architect or Certified Kubernetes Administrator (CKA).
• Scripting proficiency in Python, Bash, or Go for infrastructure automation.
• Experience with service mesh technologies (Istio, Linkerd) and GitOps tooling (ArgoCD, Flux).
• Knowledge of zero-trust security architectures and automated compliance scanning.`,
  },
];

export function getSampleJdPreset(id: string): SampleJdPreset | undefined {
  return SAMPLE_JD_PRESETS.find((p) => p.id === id);
}
