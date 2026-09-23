// Shared fixtures for engine + integration tests.

import { ResumeData, DEFAULT_SECTION_ORDER } from '../src/types';

export const JAVA_JD = `Senior Java Backend Engineer

Nomos Bank is building the next generation of its digital banking platform and looking for a Senior Java Backend Engineer to join our Payments team in Manchester (hybrid).

About the role
You will design and build high-throughput payment services used by over 2 million customers, working closely with product and platform teams.

What you'll do
- Design, build and operate REST APIs and microservices in Java 17 and Spring Boot
- Improve reliability and observability of payment flows (Kafka, Prometheus, Grafana)
- Optimise PostgreSQL data models and queries for scale
- Champion CI/CD, automated testing and code review culture
- Mentor mid-level engineers and lead design reviews

What we're looking for
- 5+ years of backend engineering experience with Java and Spring Boot
- Strong REST API design and microservices experience
- Solid PostgreSQL and query optimisation skills
- Experience with Docker and Kubernetes in production
- Experience with Kafka or similar message queues
- Bachelor's degree in Computer Science or equivalent practical experience

Nice to have
- AWS (EKS, RDS) and Terraform experience
- Experience in fintech or payments
- Kubernetes certification (CKA) is a plus

We offer competitive salary, hybrid working, and a genuine commitment to engineering culture.`;

export const REACT_JD = `Frontend Engineer (React)

PixelWorks is a design-led product studio. We are looking for a Frontend Engineer with strong React skills to build accessible, high-performance web applications.

Responsibilities
- Build responsive, accessible interfaces with React and TypeScript
- Manage complex client state with Redux Toolkit
- Integrate REST APIs and WebSockets for realtime features
- Collaborate with designers on design systems using Tailwind CSS
- Write unit and integration tests with Jest

Requirements
- 3+ years of experience with React and JavaScript/TypeScript
- Solid understanding of HTML, CSS and responsive design
- Experience with state management (Redux)
- Familiarity with testing frameworks (Jest, React Testing Library)
- Good communication skills and teamwork

Nice to have
- Next.js and server-side rendering experience
- GraphQL knowledge
- Experience with accessibility (WCAG)`;

export function makeMasterCV(): ResumeData {
  return {
    personal: {
      fullName: 'Aarav Sharma',
      email: 'aarav.sharma@example.com',
      phone: '+44 7700 900123',
      location: 'Manchester, UK',
      linkedin: 'linkedin.com/in/aaravsharma',
      github: 'github.com/aaravsharma',
      portfolio: '',
      headline: 'Backend Engineer',
    },
    summary:
      'Backend engineer with 4 years of experience building REST APIs and distributed services in Java and Spring Boot. Delivered payment integrations handling thousands of transactions per day and improved API latency by 30% through query optimisation.',
    experience: [
      {
        id: 'exp_1',
        company: 'Finlio Technologies',
        title: 'Software Engineer',
        location: 'Manchester',
        startDate: '08/2022',
        endDate: 'Present',
        current: true,
        bullets: [
          'Developed RESTful backend services using Java and Spring Boot serving 120k daily requests.',
          'Optimised PostgreSQL queries and indexes, reducing average API response time by 30%.',
          'Built CI/CD pipelines with Jenkins and Docker, cutting deployment time from 40 minutes to 8 minutes.',
          'Worked on backend development tasks across the payments team.',
        ],
      },
      {
        id: 'exp_2',
        company: 'Cloudline Systems',
        title: 'Junior Developer',
        location: 'Leeds',
        startDate: '06/2021',
        endDate: '07/2022',
        current: false,
        bullets: [
          'Implemented microservices in Java with Kafka-based event streaming for order processing.',
          'Wrote JUnit and Mockito unit tests raising coverage from 45% to 82%.',
        ],
      },
    ],
    projects: [
      {
        id: 'prj_1',
        name: 'LedgerSync',
        link: 'github.com/aaravsharma/ledgersync',
        description: 'Open-source ledger reconciliation tool.',
        bullets: [
          'Built a Spring Boot service reconciling 50k transactions nightly with PostgreSQL and Redis caching.',
        ],
        tech: ['Java', 'Spring Boot', 'PostgreSQL', 'Redis'],
      },
    ],
    education: [
      {
        id: 'edu_1',
        institution: 'University of Leeds',
        degree: 'BSc',
        field: 'Computer Science',
        startDate: '2017',
        endDate: '2021',
        grade: '2:1',
      },
    ],
    skills: {
      technical: [
        'Java',
        'Spring Boot',
        'PostgreSQL',
        'Docker',
        'Kafka',
        'Redis',
        'Jenkins',
        'REST APIs',
        'Microservices',
        'Git',
      ],
      soft: ['Collaboration', 'Mentoring', 'Problem solving', 'Communication'],
    },
    certifications: [
      { id: 'cert_1', name: 'Oracle Certified Professional: Java SE 17', issuer: 'Oracle', year: '2023' },
    ],
    languages: [
      { id: 'lang_1', name: 'English', proficiency: 'Fluent' },
      { id: 'lang_2', name: 'Hindi', proficiency: 'Native' },
    ],
    achievements: [
      'Won internal hackathon 2023 with an automated reconciliation prototype.',
    ],
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    hiddenSections: [],
  };
}

/** A CV for a candidate applying to the React JD: strong frontend, no backend Java. */
export function makeFrontendCV(): ResumeData {
  const cv = makeMasterCV();
  cv.personal.headline = 'Frontend Engineer';
  cv.personal.fullName = 'Mia Chen';
  cv.summary =
    'Frontend engineer with 4 years of experience building accessible web applications with React and TypeScript. Improved Core Web Vitals across three products and led the adoption of a shared design system.';
  cv.experience = [
    {
      id: 'exp_1',
      company: 'Brightline Media',
      title: 'Frontend Engineer',
      location: 'London',
      startDate: '09/2022',
      endDate: 'Present',
      current: true,
      bullets: [
        'Developed responsive interfaces in React and TypeScript used by 200k monthly users.',
        'Reduced bundle size by 40% and improved Lighthouse performance scores from 62 to 95.',
        'Built reusable components with Tailwind CSS and Storybook as part of a shared design system.',
        'Worked on frontend development across two product teams.',
      ],
    },
  ];
  cv.projects = [
    {
      id: 'prj_1',
      name: 'Recipebox',
      link: 'github.com/miachen/recipebox',
      description: 'A recipe manager PWA.',
      bullets: ['Built an offline-first recipe PWA with React and IndexedDB, 5k active users.'],
      tech: ['React', 'TypeScript'],
    },
  ];
  cv.skills = {
    technical: ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS', 'Redux', 'Tailwind CSS', 'Jest', 'Git'],
    soft: ['Communication', 'Teamwork'],
  };
  cv.education = [
    { id: 'edu_1', institution: 'King College London', degree: 'BA', field: 'Digital Media', startDate: '2016', endDate: '2020', grade: '' },
  ];
  cv.certifications = [];
  return cv;
}

/** A graduate CV with no professional experience. */
export function makeGraduateCV(): ResumeData {
  const cv = makeMasterCV();
  cv.personal.fullName = 'Tom Ellis';
  cv.personal.headline = 'Graduate Software Engineer';
  cv.summary = 'Computer Science graduate with experience building web and data projects in Python and JavaScript.';
  cv.experience = [];
  cv.projects = [
    {
      id: 'prj_1',
      name: 'Campus Events',
      link: '',
      description: 'Web app for discovering campus events.',
      bullets: ['Built a Flask web app with PostgreSQL used by 800 students in its first term.'],
      tech: ['Python', 'Flask', 'PostgreSQL'],
    },
  ];
  cv.skills = { technical: ['Python', 'JavaScript', 'SQL', 'Git'], soft: ['Teamwork'] };
  cv.education = [
    { id: 'edu_1', institution: 'University of Manchester', degree: 'BSc', field: 'Computer Science', startDate: '2022', endDate: '2026', grade: 'Expected 2:1' },
  ];
  cv.certifications = [];
  cv.achievements = [];
  return cv;
}
