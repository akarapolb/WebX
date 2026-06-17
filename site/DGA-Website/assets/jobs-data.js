/* =====================================================================
   jobs-data.js — ข้อมูลตำแหน่งงานกลาง (ใช้ทั้งหน้า list และ detail)
   โครงสร้างรองรับ 2 ภาษา (th/en) · เดโม (ปกติจะดึงจาก Headless CMS/API)
   ===================================================================== */
window.DGA_JOBS = [
  {
    id: 'fullstack-dev',
    deptKey: 'tech', typeKey: 'fulltime', openings: 2,
    title: { th: 'นักพัฒนาระบบ (Full-stack Developer)', en: 'Full-stack Developer' },
    dept: { th: 'ฝ่ายพัฒนาระบบดิจิทัล', en: 'Digital Systems' },
    type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' },
    salary: { th: '45,000–75,000 บาท/เดือน', en: 'THB 45,000–75,000 /month' },
    deadline: { th: '31 ก.ค. 2569', en: '31 Jul 2026' },
    summary: {
      th: 'พัฒนาและดูแลแพลตฟอร์มบริการภาครัฐที่มีผู้ใช้งานหลายล้านคน ด้วยเทคโนโลยีเว็บสมัยใหม่ ร่วมทีมที่ขับเคลื่อนรัฐบาลดิจิทัลของไทย',
      en: 'Build and maintain government service platforms used by millions, with modern web technologies, in a team driving Thailand’s digital government.'
    },
    responsibilities: {
      th: ['ออกแบบและพัฒนาเว็บแอปพลิเคชันทั้งฝั่ง front-end และ back-end', 'พัฒนาและเชื่อมต่อ REST API กับระบบกลางภาครัฐ', 'ดูแลคุณภาพโค้ด เขียน unit test และทำ code review', 'ทำงานร่วมกับทีม UX/UI และ Product เพื่อส่งมอบฟีเจอร์'],
      en: ['Design and build web apps across front-end and back-end', 'Develop and integrate REST APIs with central government systems', 'Maintain code quality, write unit tests and do code reviews', 'Collaborate with UX/UI and Product teams to ship features']
    },
    qualifications: {
      th: ['ปริญญาตรีสาขาวิทยาการคอมพิวเตอร์ วิศวกรรมซอฟต์แวร์ หรือเทียบเท่า', 'ประสบการณ์พัฒนาเว็บอย่างน้อย 2 ปี (JavaScript/TypeScript)', 'คุ้นเคยกับ React หรือ Vue และ Node.js', 'เข้าใจหลักความปลอดภัยของเว็บและการออกแบบ API'],
      en: ['Bachelor’s in Computer Science, Software Engineering or equivalent', 'At least 2 years of web development (JavaScript/TypeScript)', 'Familiar with React or Vue and Node.js', 'Understanding of web security and API design']
    },
    benefits: {
      th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'ทำงานแบบไฮบริด ยืดหยุ่นเวลา', 'งบพัฒนาทักษะและคอร์สอบรม', 'กองทุนสำรองเลี้ยงชีพ'],
      en: ['Group health & life insurance', 'Hybrid work with flexible hours', 'Learning budget and training courses', 'Provident fund']
    }
  },
  {
    id: 'data-scientist',
    deptKey: 'data', typeKey: 'fulltime', openings: 1,
    title: { th: 'นักวิทยาศาสตร์ข้อมูล (Data Scientist)', en: 'Data Scientist' },
    dept: { th: 'ฝ่ายข้อมูลและปัญญาประดิษฐ์', en: 'Data & AI' },
    type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' },
    salary: { th: '50,000–85,000 บาท/เดือน', en: 'THB 50,000–85,000 /month' },
    deadline: { th: '15 ส.ค. 2569', en: '15 Aug 2026' },
    summary: {
      th: 'วิเคราะห์ข้อมูลเปิดภาครัฐและสร้างโมเดลเพื่อสนับสนุนการตัดสินใจเชิงนโยบาย พัฒนาบริการอัจฉริยะให้ประชาชน',
      en: 'Analyze open government data and build models to support policy decisions and intelligent citizen services.'
    },
    responsibilities: {
      th: ['วิเคราะห์ชุดข้อมูลขนาดใหญ่และจัดทำรายงานเชิงลึก', 'พัฒนาโมเดล Machine Learning และประเมินผล', 'ทำงานร่วมกับหน่วยงานเพื่อกำหนดโจทย์ข้อมูล', 'สื่อสารผลการวิเคราะห์ให้ผู้บริหารเข้าใจ'],
      en: ['Analyze large datasets and produce in-depth reports', 'Develop and evaluate machine learning models', 'Work with agencies to frame data problems', 'Communicate findings clearly to executives']
    },
    qualifications: {
      th: ['ปริญญาตรี/โท สาขาสถิติ วิทยาการข้อมูล หรือเทียบเท่า', 'ใช้ Python และไลบรารีวิเคราะห์ข้อมูลได้คล่อง (pandas, scikit-learn)', 'มีประสบการณ์ทำงานกับข้อมูลจริงอย่างน้อย 2 ปี', 'สื่อสารและนำเสนอผลได้ดี'],
      en: ['Bachelor’s/Master’s in Statistics, Data Science or equivalent', 'Strong Python and data libraries (pandas, scikit-learn)', 'At least 2 years working with real-world data', 'Strong communication and presentation skills']
    },
    benefits: {
      th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'งบประมาณเข้าร่วมงานสัมมนาวิชาการ', 'งบพัฒนาทักษะและคอร์สอบรม', 'กองทุนสำรองเลี้ยงชีพ'],
      en: ['Group health & life insurance', 'Budget for academic conferences', 'Learning budget and training courses', 'Provident fund']
    }
  },
  {
    id: 'ux-designer',
    deptKey: 'design', typeKey: 'fulltime', openings: 1,
    title: { th: 'นักออกแบบประสบการณ์ผู้ใช้ (UX/UI Designer)', en: 'UX/UI Designer' },
    dept: { th: 'ฝ่ายออกแบบบริการ', en: 'Service Design' },
    type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' },
    salary: { th: '40,000–65,000 บาท/เดือน', en: 'THB 40,000–65,000 /month' },
    deadline: { th: '20 ส.ค. 2569', en: '20 Aug 2026' },
    summary: {
      th: 'ออกแบบบริการดิจิทัลภาครัฐให้ใช้งานง่าย เข้าถึงได้ทุกคน (WCAG) ตั้งแต่การวิจัยผู้ใช้จนถึงต้นแบบและ Design System',
      en: 'Design accessible, easy-to-use government digital services (WCAG) — from user research to prototypes and the Design System.'
    },
    responsibilities: {
      th: ['ทำวิจัยผู้ใช้และทดสอบการใช้งาน (usability testing)', 'ออกแบบ wireframe, prototype และ UI ที่เข้าถึงได้', 'ดูแลและต่อยอด Design System', 'ทำงานใกล้ชิดกับทีมพัฒนาเพื่อส่งมอบงาน'],
      en: ['Conduct user research and usability testing', 'Design wireframes, prototypes and accessible UI', 'Maintain and extend the Design System', 'Work closely with developers to deliver']
    },
    qualifications: {
      th: ['ประสบการณ์ออกแบบ UX/UI อย่างน้อย 2 ปี', 'ใช้ Figma ได้คล่องและมี portfolio', 'เข้าใจหลักการเข้าถึง (Accessibility/WCAG)', 'สื่อสารและทำงานเป็นทีมได้ดี'],
      en: ['At least 2 years of UX/UI design experience', 'Proficient in Figma with a portfolio', 'Understanding of accessibility (WCAG)', 'Strong communication and teamwork']
    },
    benefits: {
      th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'ทำงานแบบไฮบริด ยืดหยุ่นเวลา', 'อุปกรณ์และซอฟต์แวร์สำหรับงานออกแบบ', 'กองทุนสำรองเลี้ยงชีพ'],
      en: ['Group health & life insurance', 'Hybrid work with flexible hours', 'Design hardware and software provided', 'Provident fund']
    }
  },
  {
    id: 'security-engineer',
    deptKey: 'security', typeKey: 'fulltime', openings: 1,
    title: { th: 'วิศวกรความมั่นคงปลอดภัยไซเบอร์ (Security Engineer)', en: 'Cybersecurity Engineer' },
    dept: { th: 'ฝ่ายความมั่นคงปลอดภัยสารสนเทศ', en: 'Information Security' },
    type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' },
    salary: { th: '55,000–90,000 บาท/เดือน', en: 'THB 55,000–90,000 /month' },
    deadline: { th: '10 ส.ค. 2569', en: '10 Aug 2026' },
    summary: {
      th: 'ดูแลความปลอดภัยของโครงสร้างพื้นฐานและบริการดิจิทัลภาครัฐ เฝ้าระวังภัยคุกคาม และยกระดับมาตรฐานความมั่นคงปลอดภัย',
      en: 'Protect government digital infrastructure and services, monitor threats, and raise security standards.'
    },
    responsibilities: {
      th: ['ประเมินช่องโหว่และทำ penetration testing', 'เฝ้าระวังและตอบสนองเหตุการณ์ความปลอดภัย (SOC/IR)', 'กำหนดและตรวจสอบมาตรฐานความปลอดภัย', 'ให้คำปรึกษาด้านความปลอดภัยแก่ทีมพัฒนา'],
      en: ['Assess vulnerabilities and run penetration tests', 'Monitor and respond to security incidents (SOC/IR)', 'Define and audit security standards', 'Advise development teams on security']
    },
    qualifications: {
      th: ['ประสบการณ์ด้านความมั่นคงปลอดภัยไซเบอร์อย่างน้อย 3 ปี', 'เข้าใจ network/web security เชิงลึก', 'มีใบรับรอง เช่น CompTIA Security+, CEH, OSCP (พิจารณาพิเศษ)', 'รับผิดชอบสูงและละเอียดรอบคอบ'],
      en: ['At least 3 years in cybersecurity', 'Deep understanding of network/web security', 'Certifications such as Security+, CEH, OSCP are a plus', 'Highly responsible and detail-oriented']
    },
    benefits: {
      th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'งบสอบใบรับรองวิชาชีพ', 'งบพัฒนาทักษะและคอร์สอบรม', 'กองทุนสำรองเลี้ยงชีพ'],
      en: ['Group health & life insurance', 'Budget for professional certifications', 'Learning budget and training courses', 'Provident fund']
    }
  },
  {
    id: 'project-manager',
    deptKey: 'pm', typeKey: 'contract', openings: 1,
    title: { th: 'ผู้จัดการโครงการดิจิทัล (Project Manager)', en: 'Digital Project Manager' },
    dept: { th: 'ฝ่ายบริหารโครงการ', en: 'Project Management' },
    type: { th: 'สัญญาจ้าง (1 ปี)', en: 'Contract (1 year)' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' },
    salary: { th: '60,000–95,000 บาท/เดือน', en: 'THB 60,000–95,000 /month' },
    deadline: { th: '5 ส.ค. 2569', en: '5 Aug 2026' },
    summary: {
      th: 'บริหารโครงการพัฒนาระบบดิจิทัลภาครัฐให้สำเร็จตามเป้าหมาย ขอบเขต เวลา และงบประมาณ ประสานงานหลายหน่วยงาน',
      en: 'Lead government digital projects to success on scope, time and budget, coordinating across multiple agencies.'
    },
    responsibilities: {
      th: ['วางแผนและบริหารโครงการตามหลัก PM (Agile/Waterfall)', 'บริหารความเสี่ยง งบประมาณ และผู้มีส่วนได้ส่วนเสีย', 'ติดตามความคืบหน้าและรายงานผู้บริหาร', 'ประสานงานทีมพัฒนาและหน่วยงานที่เกี่ยวข้อง'],
      en: ['Plan and manage projects (Agile/Waterfall)', 'Manage risks, budget and stakeholders', 'Track progress and report to executives', 'Coordinate dev teams and partner agencies']
    },
    qualifications: {
      th: ['ประสบการณ์บริหารโครงการ IT อย่างน้อย 3 ปี', 'มีใบรับรอง PMP หรือ Scrum (พิจารณาพิเศษ)', 'ทักษะการสื่อสารและการเจรจาดีเยี่ยม', 'จัดการหลายโครงการพร้อมกันได้'],
      en: ['At least 3 years managing IT projects', 'PMP or Scrum certification is a plus', 'Excellent communication and negotiation', 'Able to manage multiple projects']
    },
    benefits: {
      th: ['ประกันสุขภาพกลุ่ม', 'ทำงานแบบไฮบริด', 'งบพัฒนาทักษะ', 'โบนัสตามผลงานโครงการ'],
      en: ['Group health insurance', 'Hybrid work', 'Learning budget', 'Project performance bonus']
    }
  },
  {
    id: 'dev-intern',
    deptKey: 'tech', typeKey: 'internship', openings: 5,
    title: { th: 'นักศึกษาฝึกงาน — พัฒนาซอฟต์แวร์', en: 'Software Development Intern' },
    dept: { th: 'ฝ่ายพัฒนาระบบดิจิทัล', en: 'Digital Systems' },
    type: { th: 'ฝึกงาน', en: 'Internship' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' },
    salary: { th: 'เบี้ยเลี้ยง 500 บาท/วัน', en: 'Allowance THB 500 /day' },
    deadline: { th: '30 ก.ย. 2569', en: '30 Sep 2026' },
    summary: {
      th: 'โอกาสเรียนรู้การพัฒนาระบบจริงร่วมกับทีมมืออาชีพ เหมาะสำหรับนักศึกษาที่อยากเริ่มต้นสายงานเทคโนโลยีภาครัฐ',
      en: 'Hands-on experience building real systems with a professional team — ideal for students starting a career in govtech.'
    },
    responsibilities: {
      th: ['ร่วมพัฒนาฟีเจอร์ภายใต้การดูแลของพี่เลี้ยง', 'เรียนรู้ขั้นตอนการทำงานจริงและเครื่องมือของทีม', 'ทดสอบและแก้ไขข้อบกพร่องของระบบ'],
      en: ['Build features under mentorship', 'Learn real workflows and team tooling', 'Test and fix bugs']
    },
    qualifications: {
      th: ['กำลังศึกษาระดับปริญญาตรีสาขาที่เกี่ยวข้อง', 'มีพื้นฐานการเขียนโปรแกรม', 'กระตือรือร้นและพร้อมเรียนรู้', 'ฝึกงานได้อย่างน้อย 2 เดือน'],
      en: ['Currently studying a related bachelor’s degree', 'Basic programming knowledge', 'Eager and ready to learn', 'Available for at least 2 months']
    },
    benefits: {
      th: ['เบี้ยเลี้ยงรายวัน', 'พี่เลี้ยงดูแลตลอดการฝึกงาน', 'ใบรับรองการฝึกงาน', 'โอกาสร่วมงานต่อหลังจบการศึกษา'],
      en: ['Daily allowance', 'Dedicated mentor', 'Internship certificate', 'Potential full-time offer after graduation']
    }
  },
  {
    id: 'devops-engineer', deptKey: 'tech', typeKey: 'fulltime', openings: 2,
    title: { th: 'วิศวกร DevOps', en: 'DevOps Engineer' },
    dept: { th: 'ฝ่ายพัฒนาระบบดิจิทัล', en: 'Digital Systems' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' }, salary: { th: '55,000–85,000 บาท/เดือน', en: 'THB 55,000–85,000 /month' }, deadline: { th: '18 ส.ค. 2569', en: '18 Aug 2026' },
    summary: { th: 'ดูแลระบบ CI/CD และโครงสร้างพื้นฐานคลาวด์ภาครัฐให้เสถียร ปลอดภัย และขยายตัวได้', en: 'Run CI/CD pipelines and government cloud infrastructure that is reliable, secure and scalable.' },
    responsibilities: { th: ['ออกแบบและดูแล pipeline CI/CD', 'บริหารโครงสร้างพื้นฐานแบบ Infrastructure as Code', 'เฝ้าระวังระบบและปรับปรุงประสิทธิภาพ'], en: ['Design and maintain CI/CD pipelines', 'Manage Infrastructure as Code', 'Monitor systems and tune performance'] },
    qualifications: { th: ['ประสบการณ์ DevOps อย่างน้อย 3 ปี', 'ใช้ Docker, Kubernetes และคลาวด์ได้คล่อง', 'เขียนสคริปต์อัตโนมัติได้ดี'], en: ['At least 3 years in DevOps', 'Strong Docker, Kubernetes and cloud', 'Good automation scripting'] },
    benefits: { th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'ทำงานแบบไฮบริด', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health & life insurance', 'Hybrid work', 'Provident fund'] }
  },
  {
    id: 'cloud-engineer', deptKey: 'tech', typeKey: 'fulltime', openings: 1,
    title: { th: 'วิศวกรคลาวด์ (Cloud Engineer)', en: 'Cloud Engineer' },
    dept: { th: 'ฝ่ายพัฒนาระบบดิจิทัล', en: 'Digital Systems' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '50,000–80,000 บาท/เดือน', en: 'THB 50,000–80,000 /month' }, deadline: { th: '22 ส.ค. 2569', en: '22 Aug 2026' },
    summary: { th: 'ออกแบบและดูแลบริการบนคลาวด์ภาครัฐ (GDCC) ให้มีความพร้อมใช้งานสูงและคุ้มค่า', en: 'Design and operate services on the government cloud (GDCC) for high availability and cost efficiency.' },
    responsibilities: { th: ['ออกแบบสถาปัตยกรรมระบบบนคลาวด์', 'ดูแลความปลอดภัยและการสำรองข้อมูล', 'ปรับปรุงต้นทุนและประสิทธิภาพ'], en: ['Design cloud architectures', 'Manage security and backups', 'Optimize cost and performance'] },
    qualifications: { th: ['ประสบการณ์งานคลาวด์อย่างน้อย 2 ปี', 'เข้าใจ networking และ security บนคลาวด์', 'มีใบรับรองคลาวด์ (พิจารณาพิเศษ)'], en: ['At least 2 years of cloud experience', 'Understanding of cloud networking and security', 'Cloud certifications are a plus'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'งบสอบใบรับรอง', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health insurance', 'Certification budget', 'Provident fund'] }
  },
  {
    id: 'mobile-developer', deptKey: 'tech', typeKey: 'fulltime', openings: 2,
    title: { th: 'นักพัฒนาแอปพลิเคชันมือถือ (Mobile Developer)', en: 'Mobile Developer' },
    dept: { th: 'ฝ่ายพัฒนาระบบดิจิทัล', en: 'Digital Systems' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' }, salary: { th: '45,000–75,000 บาท/เดือน', en: 'THB 45,000–75,000 /month' }, deadline: { th: '25 ส.ค. 2569', en: '25 Aug 2026' },
    summary: { th: 'พัฒนาแอปบริการภาครัฐ (เช่น ทางรัฐ) บน iOS/Android ให้ใช้งานง่ายและเข้าถึงได้', en: 'Build government service apps (e.g. Tang Rath) on iOS/Android that are easy to use and accessible.' },
    responsibilities: { th: ['พัฒนาแอปบน iOS และ/หรือ Android', 'เชื่อมต่อ API และจัดการสถานะข้อมูล', 'ดูแลคุณภาพและประสบการณ์ผู้ใช้'], en: ['Develop iOS and/or Android apps', 'Integrate APIs and manage state', 'Care for quality and UX'] },
    qualifications: { th: ['ประสบการณ์พัฒนาแอปมือถืออย่างน้อย 2 ปี', 'คุ้นเคยกับ Flutter, React Native หรือ native', 'ใส่ใจรายละเอียดและการเข้าถึง'], en: ['At least 2 years of mobile development', 'Familiar with Flutter, React Native or native', 'Detail-oriented and accessibility-minded'] },
    benefits: { th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'ทำงานแบบไฮบริด', 'งบพัฒนาทักษะ'], en: ['Group health & life insurance', 'Hybrid work', 'Learning budget'] }
  },
  {
    id: 'qa-engineer', deptKey: 'tech', typeKey: 'fulltime', openings: 1,
    title: { th: 'วิศวกรทดสอบระบบ (QA Engineer)', en: 'QA Engineer' },
    dept: { th: 'ฝ่ายพัฒนาระบบดิจิทัล', en: 'Digital Systems' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '40,000–65,000 บาท/เดือน', en: 'THB 40,000–65,000 /month' }, deadline: { th: '28 ส.ค. 2569', en: '28 Aug 2026' },
    summary: { th: 'วางแผนและทดสอบคุณภาพระบบบริการภาครัฐ ทั้งแบบ manual และ automation', en: 'Plan and test the quality of government services, both manual and automated.' },
    responsibilities: { th: ['ออกแบบ test case และทดสอบระบบ', 'พัฒนา automated test', 'รายงานและติดตามข้อบกพร่อง'], en: ['Design test cases and test systems', 'Build automated tests', 'Report and track defects'] },
    qualifications: { th: ['ประสบการณ์ QA อย่างน้อย 2 ปี', 'คุ้นเคยกับเครื่องมือทดสอบอัตโนมัติ', 'ละเอียดรอบคอบและเป็นระบบ'], en: ['At least 2 years in QA', 'Familiar with test automation tools', 'Systematic and detail-oriented'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'งบพัฒนาทักษะ', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health insurance', 'Learning budget', 'Provident fund'] }
  },
  {
    id: 'data-engineer', deptKey: 'data', typeKey: 'fulltime', openings: 1,
    title: { th: 'วิศวกรข้อมูล (Data Engineer)', en: 'Data Engineer' },
    dept: { th: 'ฝ่ายข้อมูลและปัญญาประดิษฐ์', en: 'Data & AI' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '50,000–80,000 บาท/เดือน', en: 'THB 50,000–80,000 /month' }, deadline: { th: '12 ส.ค. 2569', en: '12 Aug 2026' },
    summary: { th: 'ออกแบบและดูแล data pipeline และคลังข้อมูลกลางภาครัฐให้พร้อมใช้วิเคราะห์', en: 'Build and maintain data pipelines and the central government data warehouse for analytics.' },
    responsibilities: { th: ['ออกแบบและพัฒนา ETL/ELT pipeline', 'ดูแลคุณภาพและความปลอดภัยของข้อมูล', 'สนับสนุนทีมวิเคราะห์ข้อมูล'], en: ['Design and build ETL/ELT pipelines', 'Ensure data quality and security', 'Support analytics teams'] },
    qualifications: { th: ['ประสบการณ์ด้านข้อมูลอย่างน้อย 2 ปี', 'ใช้ SQL และ Python ได้คล่อง', 'เข้าใจ data warehouse และ big data'], en: ['At least 2 years in data engineering', 'Strong SQL and Python', 'Understanding of data warehouse and big data'] },
    benefits: { th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'งบพัฒนาทักษะ', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health & life insurance', 'Learning budget', 'Provident fund'] }
  },
  {
    id: 'data-analyst-intern', deptKey: 'data', typeKey: 'internship', openings: 3,
    title: { th: 'นักศึกษาฝึกงาน — วิเคราะห์ข้อมูล', en: 'Data Analyst Intern' },
    dept: { th: 'ฝ่ายข้อมูลและปัญญาประดิษฐ์', en: 'Data & AI' }, type: { th: 'ฝึกงาน', en: 'Internship' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' }, salary: { th: 'เบี้ยเลี้ยง 500 บาท/วัน', en: 'Allowance THB 500 /day' }, deadline: { th: '30 ก.ย. 2569', en: '30 Sep 2026' },
    summary: { th: 'เรียนรู้การวิเคราะห์ข้อมูลจริงและจัดทำรายงานร่วมกับทีมข้อมูลมืออาชีพ', en: 'Learn real data analysis and reporting with a professional data team.' },
    responsibilities: { th: ['ช่วยวิเคราะห์ข้อมูลและทำ dashboard', 'จัดทำรายงานเบื้องต้น', 'เรียนรู้เครื่องมือวิเคราะห์ข้อมูล'], en: ['Assist with analysis and dashboards', 'Prepare basic reports', 'Learn analytics tools'] },
    qualifications: { th: ['กำลังศึกษาสาขาที่เกี่ยวข้อง', 'มีพื้นฐาน SQL หรือ Excel', 'พร้อมเรียนรู้สิ่งใหม่'], en: ['Studying a related field', 'Basic SQL or Excel', 'Eager to learn'] },
    benefits: { th: ['เบี้ยเลี้ยงรายวัน', 'พี่เลี้ยงดูแล', 'ใบรับรองการฝึกงาน'], en: ['Daily allowance', 'Dedicated mentor', 'Internship certificate'] }
  },
  {
    id: 'business-analyst', deptKey: 'pm', typeKey: 'fulltime', openings: 2,
    title: { th: 'นักวิเคราะห์ธุรกิจ (Business Analyst)', en: 'Business Analyst' },
    dept: { th: 'ฝ่ายบริหารโครงการ', en: 'Project Management' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '45,000–70,000 บาท/เดือน', en: 'THB 45,000–70,000 /month' }, deadline: { th: '14 ส.ค. 2569', en: '14 Aug 2026' },
    summary: { th: 'วิเคราะห์ความต้องการและออกแบบกระบวนการ เชื่อมโยงโจทย์ธุรกิจกับทีมพัฒนา', en: 'Analyze requirements and design processes, bridging business needs and the development team.' },
    responsibilities: { th: ['เก็บและวิเคราะห์ความต้องการของผู้ใช้', 'จัดทำเอกสารและแผนภาพกระบวนการ', 'ประสานงานระหว่างผู้ใช้และทีมพัฒนา'], en: ['Gather and analyze requirements', 'Write specs and process diagrams', 'Coordinate users and developers'] },
    qualifications: { th: ['ประสบการณ์ BA อย่างน้อย 2 ปี', 'สื่อสารและเขียนเอกสารได้ดี', 'เข้าใจกระบวนการพัฒนาซอฟต์แวร์'], en: ['At least 2 years as a BA', 'Strong communication and documentation', 'Understanding of software processes'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'ทำงานแบบไฮบริด', 'งบพัฒนาทักษะ'], en: ['Group health insurance', 'Hybrid work', 'Learning budget'] }
  },
  {
    id: 'product-owner', deptKey: 'pm', typeKey: 'fulltime', openings: 1,
    title: { th: 'เจ้าของผลิตภัณฑ์ (Product Owner)', en: 'Product Owner' },
    dept: { th: 'ฝ่ายบริหารโครงการ', en: 'Project Management' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' }, salary: { th: '60,000–95,000 บาท/เดือน', en: 'THB 60,000–95,000 /month' }, deadline: { th: '16 ส.ค. 2569', en: '16 Aug 2026' },
    summary: { th: 'กำหนดวิสัยทัศน์และลำดับความสำคัญของผลิตภัณฑ์บริการภาครัฐ ให้ตอบโจทย์ประชาชน', en: 'Set the vision and priorities of government service products to meet citizens’ needs.' },
    responsibilities: { th: ['ดูแล product backlog และจัดลำดับความสำคัญ', 'ทำงานร่วมกับทีมพัฒนาแบบ Agile', 'วัดผลและพัฒนาผลิตภัณฑ์ต่อเนื่อง'], en: ['Manage and prioritize the product backlog', 'Work with Agile dev teams', 'Measure and iterate on the product'] },
    qualifications: { th: ['ประสบการณ์ Product/PO อย่างน้อย 3 ปี', 'เข้าใจ Agile/Scrum เป็นอย่างดี', 'ตัดสินใจจากข้อมูลได้'], en: ['At least 3 years in Product/PO', 'Strong Agile/Scrum understanding', 'Data-driven decision making'] },
    benefits: { th: ['ประกันสุขภาพและประกันชีวิตกลุ่ม', 'ทำงานแบบไฮบริด', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health & life insurance', 'Hybrid work', 'Provident fund'] }
  },
  {
    id: 'visual-designer', deptKey: 'design', typeKey: 'contract', openings: 1,
    title: { th: 'นักออกแบบกราฟิก (Visual Designer)', en: 'Visual Designer' },
    dept: { th: 'ฝ่ายออกแบบบริการ', en: 'Service Design' }, type: { th: 'สัญญาจ้าง (1 ปี)', en: 'Contract (1 year)' },
    location: { th: 'กรุงเทพฯ (ไฮบริด)', en: 'Bangkok (Hybrid)' }, salary: { th: '35,000–55,000 บาท/เดือน', en: 'THB 35,000–55,000 /month' }, deadline: { th: '24 ส.ค. 2569', en: '24 Aug 2026' },
    summary: { th: 'ออกแบบสื่อและกราฟิกประชาสัมพันธ์บริการภาครัฐให้สื่อสารชัดเจนและสวยงาม', en: 'Design communications and graphics for government services that are clear and beautiful.' },
    responsibilities: { th: ['ออกแบบสื่อดิจิทัลและอินโฟกราฟิก', 'ดูแลความสอดคล้องกับแบรนด์', 'ทำงานร่วมกับทีมสื่อสารองค์กร'], en: ['Design digital media and infographics', 'Maintain brand consistency', 'Work with the comms team'] },
    qualifications: { th: ['ประสบการณ์ออกแบบกราฟิกอย่างน้อย 2 ปี', 'ใช้ Adobe/Figma ได้คล่อง มี portfolio', 'มีความคิดสร้างสรรค์'], en: ['At least 2 years in graphic design', 'Proficient in Adobe/Figma with a portfolio', 'Creative mindset'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'ทำงานแบบไฮบริด', 'อุปกรณ์สำหรับงานออกแบบ'], en: ['Group health insurance', 'Hybrid work', 'Design equipment provided'] }
  },
  {
    id: 'comms-officer', deptKey: 'corporate', typeKey: 'fulltime', openings: 1,
    title: { th: 'เจ้าหน้าที่สื่อสารองค์กร', en: 'Communications Officer' },
    dept: { th: 'ฝ่ายสื่อสารองค์กร', en: 'Corporate Communications' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '30,000–50,000 บาท/เดือน', en: 'THB 30,000–50,000 /month' }, deadline: { th: '26 ส.ค. 2569', en: '26 Aug 2026' },
    summary: { th: 'วางแผนและผลิตเนื้อหาสื่อสารองค์กรและประชาสัมพันธ์บริการของ สพร.', en: 'Plan and produce corporate communications and PR for DGA services.' },
    responsibilities: { th: ['เขียนข่าวและเนื้อหาประชาสัมพันธ์', 'ดูแลช่องทางสื่อสังคมออนไลน์', 'ประสานงานสื่อมวลชนและกิจกรรม'], en: ['Write news and PR content', 'Manage social media channels', 'Coordinate media and events'] },
    qualifications: { th: ['ประสบการณ์ด้านสื่อสาร/PR อย่างน้อย 2 ปี', 'เขียนและสื่อสารภาษาไทยได้ดีเยี่ยม', 'คุ้นเคยกับสื่อดิจิทัล'], en: ['At least 2 years in comms/PR', 'Excellent Thai writing and communication', 'Familiar with digital media'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'งบพัฒนาทักษะ', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health insurance', 'Learning budget', 'Provident fund'] }
  },
  {
    id: 'hr-officer', deptKey: 'corporate', typeKey: 'fulltime', openings: 1,
    title: { th: 'เจ้าหน้าที่ทรัพยากรบุคคล (HR Officer)', en: 'HR Officer' },
    dept: { th: 'ฝ่ายทรัพยากรบุคคล', en: 'Human Resources' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '30,000–48,000 บาท/เดือน', en: 'THB 30,000–48,000 /month' }, deadline: { th: '27 ส.ค. 2569', en: '27 Aug 2026' },
    summary: { th: 'ดูแลงานสรรหา ว่าจ้าง และพัฒนาบุคลากรขององค์กรให้เติบโตไปด้วยกัน', en: 'Manage recruitment, onboarding and people development across the organization.' },
    responsibilities: { th: ['ดำเนินการสรรหาและคัดเลือกบุคลากร', 'ดูแลสวัสดิการและกิจกรรมพนักงาน', 'สนับสนุนการพัฒนาบุคลากร'], en: ['Run recruitment and selection', 'Manage benefits and employee activities', 'Support people development'] },
    qualifications: { th: ['ประสบการณ์งาน HR อย่างน้อย 2 ปี', 'มีทักษะการสื่อสารและประสานงานดี', 'ใส่ใจรายละเอียดและรักษาความลับ'], en: ['At least 2 years in HR', 'Strong communication and coordination', 'Detail-oriented and discreet'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'งบพัฒนาทักษะ', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health insurance', 'Learning budget', 'Provident fund'] }
  },
  {
    id: 'finance-officer', deptKey: 'corporate', typeKey: 'fulltime', openings: 1,
    title: { th: 'เจ้าหน้าที่การเงินและบัญชี', en: 'Finance & Accounting Officer' },
    dept: { th: 'ฝ่ายการเงินและบัญชี', en: 'Finance & Accounting' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '30,000–50,000 บาท/เดือน', en: 'THB 30,000–50,000 /month' }, deadline: { th: '29 ส.ค. 2569', en: '29 Aug 2026' },
    summary: { th: 'ดูแลงานการเงิน บัญชี และงบประมาณขององค์กรให้ถูกต้องและโปร่งใส', en: 'Manage the organization’s finance, accounting and budget accurately and transparently.' },
    responsibilities: { th: ['จัดทำบัญชีและรายงานการเงิน', 'ดูแลงบประมาณและการเบิกจ่าย', 'ตรวจสอบความถูกต้องตามระเบียบ'], en: ['Prepare accounts and financial reports', 'Manage budget and disbursements', 'Ensure compliance with regulations'] },
    qualifications: { th: ['ปริญญาตรีสาขาบัญชี/การเงิน', 'ประสบการณ์อย่างน้อย 2 ปี', 'ละเอียดรอบคอบและซื่อสัตย์'], en: ['Bachelor’s in Accounting/Finance', 'At least 2 years of experience', 'Detail-oriented and honest'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'กองทุนสำรองเลี้ยงชีพ', 'โบนัสประจำปี'], en: ['Group health insurance', 'Provident fund', 'Annual bonus'] }
  },
  {
    id: 'legal-officer', deptKey: 'corporate', typeKey: 'fulltime', openings: 1,
    title: { th: 'นิติกร (Legal Officer)', en: 'Legal Officer' },
    dept: { th: 'ฝ่ายกฎหมาย', en: 'Legal Affairs' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '35,000–55,000 บาท/เดือน', en: 'THB 35,000–55,000 /month' }, deadline: { th: '31 ส.ค. 2569', en: '31 Aug 2026' },
    summary: { th: 'ให้คำปรึกษาและจัดทำสัญญา รวมถึงดูแลการปฏิบัติตามกฎหมายและ PDPA ขององค์กร', en: 'Advise on and draft contracts, and oversee legal and PDPA compliance for the organization.' },
    responsibilities: { th: ['ร่างและตรวจสอบสัญญาและนิติกรรม', 'ให้คำปรึกษาด้านกฎหมายและ PDPA', 'ดูแลการปฏิบัติตามระเบียบและกฎหมาย'], en: ['Draft and review contracts', 'Advise on law and PDPA', 'Oversee regulatory compliance'] },
    qualifications: { th: ['ปริญญาตรีนิติศาสตร์', 'ประสบการณ์งานกฎหมายอย่างน้อย 2 ปี', 'เข้าใจกฎหมายดิจิทัลและ PDPA'], en: ['Bachelor of Laws', 'At least 2 years in legal work', 'Understanding of digital law and PDPA'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'งบพัฒนาทักษะ', 'กองทุนสำรองเลี้ยงชีพ'], en: ['Group health insurance', 'Learning budget', 'Provident fund'] }
  },
  {
    id: 'it-support', deptKey: 'corporate', typeKey: 'fulltime', openings: 2,
    title: { th: 'เจ้าหน้าที่สนับสนุนไอที (IT Support)', en: 'IT Support Officer' },
    dept: { th: 'ฝ่ายเทคโนโลยีสารสนเทศ', en: 'IT Operations' }, type: { th: 'พนักงานประจำ', en: 'Full-time' },
    location: { th: 'กรุงเทพฯ', en: 'Bangkok' }, salary: { th: '25,000–40,000 บาท/เดือน', en: 'THB 25,000–40,000 /month' }, deadline: { th: '2 ก.ย. 2569', en: '2 Sep 2026' },
    summary: { th: 'ดูแลและสนับสนุนระบบไอทีภายในองค์กรให้พร้อมใช้งาน แก้ปัญหาให้ผู้ใช้งาน', en: 'Maintain and support internal IT systems and help users resolve issues.' },
    responsibilities: { th: ['ดูแลอุปกรณ์และเครือข่ายภายใน', 'แก้ปัญหาและให้คำแนะนำผู้ใช้งาน', 'ติดตั้งและบำรุงรักษาระบบ'], en: ['Maintain internal devices and network', 'Troubleshoot and advise users', 'Install and maintain systems'] },
    qualifications: { th: ['ประสบการณ์งาน IT Support อย่างน้อย 1 ปี', 'มีความรู้พื้นฐานด้านเครือข่ายและระบบ', 'ใจเย็นและบริการดี'], en: ['At least 1 year in IT support', 'Basic networking and systems knowledge', 'Patient and service-minded'] },
    benefits: { th: ['ประกันสุขภาพกลุ่ม', 'กองทุนสำรองเลี้ยงชีพ', 'งบพัฒนาทักษะ'], en: ['Group health insurance', 'Provident fund', 'Learning budget'] }
  }
];
