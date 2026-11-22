/* User-maintained career title dictionary. Employer-specific names are scoped to the matching employer only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SecretJCareerDictionary=api;})(typeof window!=='undefined'?window:null,function(){return {
  "internship": {
    "keywords": [
      "intern",
      "internship",
      "interne",
      "co-op",
      "co op",
      "cooperative training",
      "cooperative education",
      "student program",
      "student programs",
      "student trainee",
      "working student",
      "summer intern",
      "winter intern",
      "paid intern",
      "work experience",
      "work experience program",
      "practical training",
      "field training",
      "sandwich year",
      "apprentice",
      "apprenticeship",
      "trainee program (student context)",
      "متدرب",
      "متدربة",
      "تدريب",
      "فرصة تدريب",
      "تدريب صيفي",
      "تدريب تعاوني",
      "طالب تدريب",
      "تدريب طلاب"
    ],
    "regex": "\\b(intern(ship)?|co[- ]?op|apprentice(ship)?)\\b",
    "company_brand_names": {
      "VOIS": [
        "Explore Internship",
        "Explore Internship Programme"
      ],
      "Deloitte Egypt": [
        "Tadarab"
      ],
      "EY Egypt": [
        "Internship",
        "Co-op",
        "Work Experience Program"
      ],
      "Amazon Egypt": [
        "Student Programs (EMEA) Intern",
        "Summer Intern"
      ],
      "Microsoft Egypt": [
        "Intern",
        "Internship"
      ],
      "Schneider Electric Egypt": [
        "Go Green (student contest pipeline to intern roles)"
      ],
      "PwC Egypt": [
        "intern (ETIC contingent roles often titled 'Graduate Program - internship')"
      ]
    }
  },
  "entry": {
    "description": "Fresh graduates / graduate programs / entry level. 0-2 years of experience.",
    "keywords": [
      "fresh graduate",
      "fresh grad",
      "freshgraduate",
      "new grad",
      "new graduate",
      "recent graduate",
      "graduate program",
      "graduate programme",
      "grad program",
      "graduate scheme",
      "graduate trainee",
      "graduate in training",
      "graduate opportunity",
      "graduate developer",
      "graduate engineer",
      "graduate analyst",
      "entry level",
      "entry-level",
      "0-2 years",
      "0 - 2 years",
      "no experience",
      "zero experience",
      "young professional",
      "young professionals program",
      "young talent",
      "young talents",
      "early career",
      "early careers",
      "early career program",
      "talent program",
      "talent programme",
      "talent academy",
      "management trainee",
      "trainee",
      "future leader",
      "future leaders",
      "future leaders program",
      "accelerator program (grad context)",
      "national graduate",
      "associate (Big4 context only: EY/Deloitte/PwC/KPMG entry grade)",
      "خريج",
      "خريجين",
      "خريج جديد",
      "برنامج الخريجين",
      "برنامج تدريب الخريجين",
      "مستوى مبتدئ",
      "بدون خبرة",
      "موظف مبتدئ"
    ],
    "regex": "\\b(fresh\\s*grad\\w*|new\\s*grad\\w*|graduate|entry[- ]?level|young professional|early career|trainee)\\b",
    "company_brand_names": {
      "VOIS": [
        "Discover Graduate",
        "Talent (program)",
        "Apprenticeship"
      ],
      "Vodafone Egypt": [
        "Discover Graduate Program",
        "Discover for Graduates"
      ],
      "Capgemini Egypt": [
        "Young Professionals Program"
      ],
      "Ericsson Egypt": [
        "Ericsson Graduate Program",
        "Early Career Program (ECP)",
        "GO Beyond Program",
        "GEN-E",
        "Global Sourcing Graduate Program"
      ],
      "EY Egypt": [
        "Graduate Program",
        "Consulting Graduate Program",
        "GCR Graduate Program",
        "Assurance Audit Graduate Opportunity"
      ],
      "Deloitte Egypt": [
        "Mustaqbaly / مستقبلي",
        "Deloitte Apprentice"
      ],
      "PwC Egypt": [
        "ETIC Graduate Program",
        "Graduate Programme",
        "EDGE graduate programme"
      ],
      "Siemens Egypt": [
        "Future Energy | Graduates Program",
        "Siemens Internship",
        "Siemens Graduate Program"
      ],
      "Valeo Egypt": [
        "Graduate In Training Program (GIT)",
        "BRAIN program (junior engineering track)"
      ],
      "Orange Egypt": [
        "Orange Graduate Program"
      ],
      "Nokia Egypt": [
        "Nokia Graduate Program"
      ],
      "IBM Egypt": [
        "Entry Level",
        "Associate (IBM entry band)"
      ],
      "SAP Egypt": [
        "SAP Academy for Customer Success",
        "Early Talent"
      ],
      "Schneider Electric Egypt": [
        "Energy Tech Accelerator (global grad program)",
        "Global Student Experience"
      ],
      "Amazon Egypt": [
        "2027 Program Manager Intern (grad-year style listings)"
      ],
      "ADCB Egypt": [
        "Management Trainee",
        "Graduate Trainee"
      ],
      "e& / Etisalat Egypt": [
        "Graduate Program",
        "e& Academy"
      ],
      "CIB Egypt": [
        "CIB Graduate Program",
        "Management Trainee"
      ]
    }
  },
  "junior": {
    "description": "1-3 years of experience. Above graduate program, below mid.",
    "keywords": [
      "junior",
      "jr",
      "junior engineer",
      "junior developer",
      "junior analyst",
      "junior accountant",
      "junior designer",
      "software engineer i",
      "swe i",
      "engineer i",
      "developer i",
      "analyst i",
      "accountant i",
      "level 1",
      "l1",
      "1-3 years",
      "1 - 3 years",
      "1 to 3 years",
      "2 years of experience",
      "assistant engineer",
      "associate engineer (tech companies)",
      "junior consultant",
      "associate consultant",
      "مبتدئ",
      "مستوى أول"
    ],
    "regex": "\\b(junior|jr)\\b|(\\b(i|i+)\\b\\s*$)|\\b(software|data|devops|qa|frontend|backend|mobile)?\\s*(engineer|developer|analyst|designer)\\s+i{1,2}\\b",
    "company_brand_names": {
      "Valeo Egypt": [
        "BRAIN (Beginner Recruitment And Integration) — junior software engineers"
      ],
      "Big4 (EY/Deloitte/PwC)": [
        "note: 'Associate' grade = entry, 'Senior Associate' = senior — handle via company-aware override"
      ]
    }
  },
  "mid": {
    "description": "Default bucket for professional roles with no seniority signal. 3-5 years.",
    "keywords": [
      "mid",
      "mid-level",
      "mid level",
      "software engineer",
      "software developer",
      "engineer",
      "developer",
      "data analyst",
      "data scientist",
      "business analyst",
      "product analyst",
      "financial analyst",
      "accountant",
      "consultant",
      "specialist",
      "professional",
      "experienced professional",
      "engineer ii",
      "swe ii",
      "analyst ii",
      "level 2",
      "l2",
      "3-5 years",
      "3 - 5 years",
      "5 years of experience",
      "senior specialist (some firms)",
      "implementation",
      "support engineer",
      "system engineer",
      "network engineer",
      "محترف",
      "أخصائي",
      "مستوى متوسط"
    ],
    "regex": "\\b(mid[- ]?level|swe?\\s*ii|engineer\\s*ii|analyst\\s*ii|specialist|consultant)\\b",
    "notes": "This is the FALLBACK category. If no other category hits, label 'mid'. Most scraped titles land here."
  },
  "senior": {
    "description": "5-8+ years, individual contributor seniority.",
    "keywords": [
      "senior",
      "sr",
      "senior engineer",
      "senior developer",
      "senior analyst",
      "senior accountant",
      "senior consultant",
      "senior associate (Big4)",
      "senior specialist",
      "staff engineer",
      "staff software engineer",
      "staff data engineer",
      "principal engineer",
      "principal developer",
      "principal analyst",
      "distinguished engineer",
      "fellow engineer",
      "technical fellow",
      "expert",
      "subject matter expert",
      "sme",
      "5-8 years",
      "5 - 8 years",
      "8+ years",
      "8 years of experience",
      "lead engineer (when not people-managing — some firms)",
      "كبير",
      "خبير",
      "مهندس أول",
      "مستشار أول"
    ],
    "regex": "\\b(senior|sr)\\b|\\bstaff\\b|\\bprincipal\\b|\\bsme\\b|\\bexpert\\b",
    "company_brand_names": {
      "Valeo Egypt": [
        "Senior Software Engineer, BRAIN track"
      ],
      "Big4": [
        "Senior Associate (promotion from Associate)"
      ]
    },
    "caution": "'Principal' alone can mean school principal — in your Egypt tech-company list it almost always means senior IC. 'Expert' inside 'Customer Expert'/'Sales Expert' is still senior-ish; acceptable."
  },
  "lead": {
    "description": "Technical or team leadership without full management. ~8+ years.",
    "keywords": [
      "lead",
      "team lead",
      "tech lead",
      "technical lead",
      "techlead",
      "team leader",
      "squad lead",
      "chapter lead",
      "guild lead",
      "lead engineer",
      "lead developer",
      "engineering lead",
      "lead data engineer",
      "lead analyst",
      "lead consultant",
      "lead designer",
      "lead qa",
      "scrum lead",
      "agile lead",
      "رئيس فريق",
      "قائد فريق",
      "المدير الفني للفريق"
    ],
    "regex": "\\b(tech(nical)?[- ]?lead|team[- ]?lead(er)?|squad[- ]?lead|chapter[- ]?lead|lead\\s+(engineer|developer|analyst|consultant|designer|qa|data))\\b",
    "caution": "FALSE POSITIVE WARNING: 'Lead Generation Specialist/Executive' (common marketing role in Egypt) contains 'lead'. Require lead to be followed by an engineering/analyst/consultant word, or check for 'generation' and reject."
  },
  "manager": {
    "description": "People or function management.",
    "keywords": [
      "manager",
      "mgr",
      "engineering manager",
      "software engineering manager",
      "development manager",
      "product manager",
      "project manager",
      "program manager",
      "portfolio manager",
      "delivery manager",
      "operations manager",
      "qa manager",
      "devops manager",
      "account manager",
      "sales manager",
      "marketing manager",
      "finance manager",
      "assistant manager",
      "deputy manager",
      "associate manager (non-Big4)",
      "business manager",
      "customer success manager",
      "talent acquisition manager",
      "مدير",
      "مدير مشروعات",
      "مدير منتج",
      "مدير هندسة",
      "مدير عمليات"
    ],
    "regex": "\\b(assistant|deputy|associate)?\\s*manager\\b|\\bmgr\\b",
    "ordering_note": "Checked BEFORE senior, so 'Senior Manager' -> manager, 'Senior Engineering Manager' -> manager. This is usually what a job board wants."
  },
  "director_head_executive": {
    "description": "Director, VP, C-level, heads of function, partners.",
    "keywords": [
      "director",
      "vp",
      "vice president",
      "vice-president",
      "head of",
      "head of engineering",
      "head of product",
      "head of data",
      "chief",
      "cto",
      "cio",
      "ceo",
      "cfo",
      "coo",
      "cmo",
      "ciso",
      "general manager",
      "gm",
      "country manager",
      "managing director",
      "md",
      "partner",
      "managing partner",
      "principal partner (consulting)",
      "executive",
      "cxo",
      "svp",
      "evp",
      "president",
      "مدير عام",
      "مدير إدارة",
      "نائب رئيس",
      "رئيس مجلس",
      "شريك",
      "شريك مؤسس",
      "الرئيس التنفيذي"
    ],
    "regex": "\\b(director|vp|vice[- ]president|head of|chief|cto|cio|cfo|coo|cmo|ciso|general manager|country manager|managing director|partner)\\b",
    "caution": "'Head of' must be checked before 'manager' and 'lead'. 'Partner' checked here (Big4 Partner). Watch 'Business Partner' (HRBP) — exclude 'business partner' pattern if you want HRBPs in mid/senior instead."
  },
  "negative_keywords_global": [
    "international (does NOT mean intern — \\bintern\\b handles it, but list for manual review)",
    "lead generation",
    "seniority (in descriptions — never match on description)",
    "junior/senior as school grades",
    "interim (interim manager = temporary manager, still manager)"
  ]
};});
