/* ==========================================================================
   BARA AWLIA IDEAL KINDERGARTEN & HIGH SCHOOL
   School Result Management System (Standalone LocalStorage Edition)
   ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    SETTINGS: "ba_school_settings_v1",
    RECORDS: "ba_student_results_v1",
    RULES: "ba_grading_rules_v1"
  };

  const DEFAULT_GRADE_SCALE = [
    { min: 80, max: 100, grade: "A+", point: 5.0 },
    { min: 70, max: 79.99, grade: "A", point: 4.0 },
    { min: 60, max: 69.99, grade: "A-", point: 3.5 },
    { min: 50, max: 59.99, grade: "B", point: 3.0 },
    { min: 40, max: 49.99, grade: "C", point: 2.0 },
    { min: 33, max: 39.99, grade: "D", point: 1.0 },
    { min: 0, max: 32.99, grade: "F", point: 0.0 }
  ];

  const DEFAULT_SETTINGS = {
    schoolName: "BARA AWLIA IDEAL KINDERGARTEN & HIGH SCHOOL",
    address: "",
    defaultExam: "",
    defaultYear: String(new Date().getFullYear()),
    principalTitle: "Head Teacher / Principal",
    logoDataUrl: ""
  };

  const DEFAULT_RULE_PROFILE = {
    id: "rule_default_nctb",
    profileName: "Default NCTB Grading Scale",
    applicableClass: "ALL",
    applicableGroup: "ALL",
    examName: "",
    academicYear: "",
    subjectPassPercent: 33,
    componentPassPercent: 33,
    passMode: "individual_and_combined", // "individual_and_combined" | "combined_only"
    optionalEnabled: true,
    optionalThreshold: 2.0,
    maxGpa: 5.0,
    gradeScale: JSON.parse(JSON.stringify(DEFAULT_GRADE_SCALE))
  };

  // Application State
  let appState = {
    settings: { ...DEFAULT_SETTINGS },
    records: [],
    rules: [],
    currentMeritList: [],
    draftSubjects: []
  };

  let pendingConfirmCallback = null;

  /* --------------------------------------------------------------------------
     Utility & Security Helpers
     -------------------------------------------------------------------------- */
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function roundTwo(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  }

  function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function openConfirmModal(title, message, onConfirm) {
    document.getElementById("confirmModalTitle").textContent = title;
    document.getElementById("confirmModalMessage").textContent = message;
    pendingConfirmCallback = onConfirm;
    document.getElementById("confirmModal").classList.remove("hidden");
  }

  function closeConfirmModal() {
    document.getElementById("confirmModal").classList.add("hidden");
    pendingConfirmCallback = null;
  }

  /* --------------------------------------------------------------------------
     LocalStorage Persistence
     -------------------------------------------------------------------------- */
  function loadState() {
    try {
      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        appState.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
      }

      const savedRules = localStorage.getItem(STORAGE_KEYS.RULES);
      if (savedRules) {
        const parsedRules = JSON.parse(savedRules);
        appState.rules = Array.isArray(parsedRules) && parsedRules.length > 0
          ? parsedRules
          : [JSON.parse(JSON.stringify(DEFAULT_RULE_PROFILE))];
      } else {
        appState.rules = [JSON.parse(JSON.stringify(DEFAULT_RULE_PROFILE))];
      }

      const savedRecords = localStorage.getItem(STORAGE_KEYS.RECORDS);
      if (savedRecords) {
        const parsedRecords = JSON.parse(savedRecords);
        appState.records = Array.isArray(parsedRecords) ? parsedRecords : [];
      }
    } catch (err) {
      console.error("Error loading LocalStorage data:", err);
      appState.rules = [JSON.parse(JSON.stringify(DEFAULT_RULE_PROFILE))];
      showToast("Warning: Some saved browser data could not be parsed.", "error");
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
    } catch (e) {
      showToast("Storage quota exceeded while saving settings/logo.", "error");
    }
  }

  function saveRules() {
    localStorage.setItem(STORAGE_KEYS.RULES, JSON.stringify(appState.rules));
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(appState.records));
  }

  /* --------------------------------------------------------------------------
     Rule Matching & NCTB Calculation Engine
     -------------------------------------------------------------------------- */
  function findApplicableRule(studentClass, studentGroup, examName, academicYear) {
    const normExam = (examName || "").trim().toLowerCase();
    const normYear = (academicYear || "").trim().toLowerCase();

    let bestRule = null;
    let bestScore = -1;

    for (const rule of appState.rules) {
      if (rule.applicableClass !== "ALL" && rule.applicableClass !== studentClass) continue;
      if (rule.applicableGroup !== "ALL" && rule.applicableGroup !== studentGroup) continue;
      if (rule.examName && rule.examName.trim().toLowerCase() !== normExam) continue;
      if (rule.academicYear && rule.academicYear.trim().toLowerCase() !== normYear) continue;

      let specificity = 0;
      if (rule.applicableClass !== "ALL") specificity += 4;
      if (rule.applicableGroup !== "ALL") specificity += 2;
      if (rule.examName && rule.examName.trim() !== "") specificity += 2;
      if (rule.academicYear && rule.academicYear.trim() !== "") specificity += 1;

      if (specificity > bestScore) {
        bestScore = specificity;
        bestRule = rule;
      }
    }

    return bestRule || appState.rules[0] || DEFAULT_RULE_PROFILE;
  }

  function lookupGradeFromScale(percentage, gradeScale) {
    const sorted = [...gradeScale].sort((a, b) => Number(b.min) - Number(a.min));
    for (const band of sorted) {
      if (percentage >= Number(band.min) && percentage <= Number(band.max) + 0.001) {
        return { grade: band.grade, point: Number(band.point) };
      }
    }
    if (percentage > 100 && sorted.length > 0) {
      return { grade: sorted[0].grade, point: Number(sorted[0].point) };
    }
    return { grade: "F", point: 0.0 };
  }

  function lookupFinalGradeFromGpa(gpa, isPassed, gradeScale) {
    if (!isPassed || gpa <= 0) return "F";
    const sorted = [...gradeScale]
      .filter((b) => Number(b.point) > 0)
      .sort((a, b) => Number(b.point) - Number(a.point));

    for (const band of sorted) {
      if (gpa >= Number(band.point)) {
        return band.grade;
      }
    }
    return "F";
  }

  /**
   * Evaluates a student's complete subject list under the selected rule profile.
   * Ensures components (MCQ, CQ, Practical, etc.) are combined into a single subject
   * and NEVER counted as separate subjects in GPA.
   */
  function evaluateStudentResult(subjects, rule) {
    const evaluatedSubjects = [];
    let grandObtained = 0;
    let grandMax = 0;
    let compulsoryCount = 0;
    let compulsoryPointsSum = 0;
    let anyCompulsoryFailed = false;
    let optionalBonusPoints = 0;

    for (const subj of subjects) {
      const weight = Number(subj.weight) > 0 ? Number(subj.weight) : 1;
      const passMode = subj.passMode && subj.passMode !== "inherit" ? subj.passMode : rule.passMode;
      const subjPassPct = subj.passPercent !== "" && subj.passPercent !== null && subj.passPercent !== undefined
        ? Number(subj.passPercent)
        : Number(rule.subjectPassPercent);

      let rawCompObtained = 0;
      let rawCompMax = 0;
      let anyComponentFailed = false;

      const evaluatedComponents = (subj.components || []).map((comp) => {
        const maxM = Number(comp.maxMarks) || 0;
        const obtM = Number(comp.obtainedMarks) || 0;
        const compPassPct = comp.passPercent !== "" && comp.passPercent !== null && comp.passPercent !== undefined
          ? Number(comp.passPercent)
          : Number(rule.componentPassPercent);

        const requiredCompMarks = (maxM * compPassPct) / 100;
        const compPassed = maxM > 0 ? obtM + 1e-9 >= requiredCompMarks : true;

        if (passMode === "individual_and_combined" && !compPassed) {
          anyComponentFailed = true;
        }

        rawCompObtained += obtM;
        rawCompMax += maxM;

        return {
          ...comp,
          maxMarks: maxM,
          obtainedMarks: obtM,
          passPercent: compPassPct,
          passed: compPassed
        };
      });

      const effectiveObtained = roundTwo(rawCompObtained * weight);
      const effectiveMax = roundTwo(rawCompMax * weight);
      const percentage = effectiveMax > 0 ? roundTwo((effectiveObtained / effectiveMax) * 100) : 0;

      const combinedPassed = percentage + 1e-9 >= subjPassPct;
      const subjectPassed = passMode === "individual_and_combined"
        ? (!anyComponentFailed && combinedPassed)
        : combinedPassed;

      let gradeInfo = { grade: "F", point: 0.0 };
      if (subjectPassed) {
        gradeInfo = lookupGradeFromScale(percentage, rule.gradeScale);
      }

      grandObtained = roundTwo(grandObtained + effectiveObtained);
      grandMax = roundTwo(grandMax + effectiveMax);

      const isOptional = Boolean(subj.isOptional);

      if (isOptional) {
        if (rule.optionalEnabled && subjectPassed) {
          const threshold = Number(rule.optionalThreshold) || 2.0;
          if (gradeInfo.point > threshold) {
            optionalBonusPoints = roundTwo(optionalBonusPoints + (gradeInfo.point - threshold));
          }
        }
      } else {
        compulsoryCount += 1;
        if (!subjectPassed || gradeInfo.point === 0) {
          anyCompulsoryFailed = true;
        } else {
          compulsoryPointsSum = roundTwo(compulsoryPointsSum + gradeInfo.point);
        }
      }

      evaluatedSubjects.push({
        id: subj.id || generateId("subj"),
        name: subj.name,
        isOptional,
        weight,
        passMode,
        passPercent: subjPassPct,
        components: evaluatedComponents,
        obtainedMarks: effectiveObtained,
        maxMarks: effectiveMax,
        percentage,
        grade: gradeInfo.grade,
        gradePoint: gradeInfo.point,
        passed: subjectPassed
      });
    }

    let baseGpa = 0;
    let finalGpa = 0;
    let finalPassed = false;

    if (evaluatedSubjects.length > 0 && compulsoryCount > 0 && !anyCompulsoryFailed) {
      finalPassed = true;
      baseGpa = roundTwo(compulsoryPointsSum / compulsoryCount);
      const rawFinal = (compulsoryPointsSum + optionalBonusPoints) / compulsoryCount;
      const maxGpa = Number(rule.maxGpa) || 5.0;
      finalGpa = roundTwo(Math.min(maxGpa, rawFinal));
    }

    const finalGrade = lookupFinalGradeFromGpa(finalGpa, finalPassed, rule.gradeScale);

    return {
      ruleId: rule.id,
      ruleName: rule.profileName,
      subjects: evaluatedSubjects,
      subjectCount: evaluatedSubjects.length,
      compulsoryCount,
      grandObtained,
      grandMax,
      baseGpa: finalPassed ? baseGpa : 0,
      finalGpa: finalPassed ? finalGpa : 0,
      finalGrade,
      finalStatus: finalPassed ? "PASS" : "FAIL"
    };
  }

  function recalculateAllRecords() {
    appState.records = appState.records.map((rec) => {
      const rule = findApplicableRule(rec.studentClass, rec.studentGroup, rec.examName, rec.academicYear);
      const evaluated = evaluateStudentResult(rec.subjects, rule);
      return {
        ...rec,
        ...evaluated,
        updatedAt: new Date().toISOString()
      };
    });
    saveRecords();
  }

  /* --------------------------------------------------------------------------
     Navigation & Header Rendering
     -------------------------------------------------------------------------- */
  function switchSection(sectionId) {
    document.querySelectorAll(".view-section").forEach((sec) => sec.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.remove("active"));

    const targetSection = document.getElementById(`section-${sectionId}`);
    if (targetSection) targetSection.classList.add("active");

    const activeNav = document.querySelector(`.nav-item[data-section="${sectionId}"]`);
    if (activeNav) activeNav.classList.add("active");

    // Close mobile drawer
    document.getElementById("sidebar").classList.remove("open");

    if (sectionId === "dashboard") renderDashboard();
    if (sectionId === "students-marks") {
      renderRecordsTable();
      updateLivePreview();
    }
    if (sectionId === "grading-rules") renderSavedRulesTable();
    if (sectionId === "merit-list") populateMeritFilterDropdowns();
    if (sectionId === "marksheet") populateMarksheetDropdown();
  }

  function renderSchoolHeader() {
    const { schoolName, address, defaultExam, defaultYear, principalTitle, logoDataUrl } = appState.settings;
    document.getElementById("headerSchoolName").textContent = schoolName || DEFAULT_SETTINGS.schoolName;
    document.getElementById("settingSchoolName").value = schoolName || DEFAULT_SETTINGS.schoolName;
    document.getElementById("settingSchoolAddress").value = address || "";
    document.getElementById("settingDefaultExam").value = defaultExam || "";
    document.getElementById("settingDefaultYear").value = defaultYear || "";
    document.getElementById("settingPrincipalTitle").value = principalTitle || "Head Teacher / Principal";

    const sidebarImg = document.getElementById("sidebarLogoImg");
    const sidebarPlaceholder = document.getElementById("sidebarLogoPlaceholder");
    const removeLogoBtn = document.getElementById("removeLogoBtn");

    if (logoDataUrl) {
      sidebarImg.src = logoDataUrl;
      sidebarImg.classList.remove("hidden");
      sidebarPlaceholder.classList.add("hidden");
      removeLogoBtn.classList.remove("hidden");
    } else {
      sidebarImg.src = "";
      sidebarImg.classList.add("hidden");
      sidebarPlaceholder.classList.remove("hidden");
      removeLogoBtn.classList.add("hidden");
    }
  }

  /* --------------------------------------------------------------------------
     Section 1: Dashboard
     -------------------------------------------------------------------------- */
  function renderDashboard() {
    const records = appState.records;
    const uniqueStudentIds = new Set(records.map((r) => (r.studentId || "").trim().toLowerCase()));
    const passedCount = records.filter((r) => r.finalStatus === "PASS").length;
    const failedCount = records.filter((r) => r.finalStatus === "FAIL").length;

    document.getElementById("statTotalStudents").textContent = uniqueStudentIds.size;
    document.getElementById("statTotalRecords").textContent = records.length;
    document.getElementById("statTotalPassed").textContent = passedCount;
    document.getElementById("statTotalFailed").textContent = failedCount;

    const tbody = document.getElementById("recentRecordsBody");
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No result records saved yet. Go to "Students &amp; Marks" to enter student records.</td></tr>`;
      return;
    }

    const recent = [...records].reverse().slice(0, 10);
    tbody.innerHTML = recent
      .map(
        (rec) => `
      <tr>
        <td><strong>${escapeHtml(rec.studentId)}</strong></td>
        <td>${escapeHtml(rec.rollNumber)}</td>
        <td>${escapeHtml(rec.studentName)}</td>
        <td>${escapeHtml(rec.studentClass)} (${escapeHtml(rec.studentGroup)})</td>
        <td>${escapeHtml(rec.examName)} - ${escapeHtml(rec.academicYear)}</td>
        <td>${rec.grandObtained} / ${rec.grandMax}</td>
        <td><strong>${Number(rec.finalGpa).toFixed(2)}</strong></td>
        <td>${escapeHtml(rec.finalGrade)}</td>
        <td><span class="status-pill ${rec.finalStatus === "PASS" ? "pass" : "fail"}">${rec.finalStatus}</span></td>
        <td>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.appActions.openMarksheet('${rec.id}')">Marksheet</button>
        </td>
      </tr>`
      )
      .join("");
  }

  /* --------------------------------------------------------------------------
     Section 2: Students & Marks Management
     -------------------------------------------------------------------------- */
  function createComponentObject(name = "Written", maxMarks = 100, obtainedMarks = 0, passPercent = "") {
    return {
      id: generateId("comp"),
      name,
      maxMarks,
      obtainedMarks,
      passPercent
    };
  }

  function createSubjectObject(name = "", components = null, isOptional = false) {
    return {
      id: generateId("subj"),
      name,
      isOptional,
      weight: 1,
      passMode: "inherit",
      passPercent: "",
      components: components || [
        createComponentObject("CQ", 70, 0, ""),
        createComponentObject("MCQ", 30, 0, "")
      ]
    };
  }

  function renderDraftSubjects() {
    const container = document.getElementById("subjectsContainer");
    if (appState.draftSubjects.length === 0) {
      container.innerHTML = `<div class="empty-state">No subjects added yet. Click "+ Add Subject" or load a preset above.</div>`;
      updateLivePreview();
      return;
    }

    container.innerHTML = appState.draftSubjects
      .map((subj, sIdx) => {
        const compRows = subj.components
          .map(
            (comp, cIdx) => `
          <tr>
            <td>
              <input type="text" data-sidx="${sIdx}" data-cidx="${cIdx}" data-field="compName" value="${escapeHtml(comp.name)}" placeholder="e.g. MCQ / CQ / Practical" required />
            </td>
            <td>
              <input type="number" min="1" max="1000" step="0.5" data-sidx="${sIdx}" data-cidx="${cIdx}" data-field="maxMarks" value="${comp.maxMarks}" required />
            </td>
            <td>
              <input type="number" min="0" max="${comp.maxMarks}" step="0.5" data-sidx="${sIdx}" data-cidx="${cIdx}" data-field="obtainedMarks" value="${comp.obtainedMarks}" required />
            </td>
            <td>
              <input type="number" min="0" max="100" step="0.5" data-sidx="${sIdx}" data-cidx="${cIdx}" data-field="compPassPercent" value="${comp.passPercent}" placeholder="Rule default" />
            </td>
            <td>
              <button type="button" class="btn btn-danger-outline btn-sm" data-action="remove-comp" data-sidx="${sIdx}" data-cidx="${cIdx}" ${subj.components.length <= 1 ? "disabled" : ""}>&times;</button>
            </td>
          </tr>`
          )
          .join("");

        return `
        <div class="subject-card" data-subject-index="${sIdx}">
          <div class="subject-card-top">
            <div class="form-group">
              <label>Subject Name *</label>
              <input type="text" data-sidx="${sIdx}" data-field="subjName" value="${escapeHtml(subj.name)}" placeholder="e.g., Bengali 1st Paper" required />
            </div>
            <div class="form-group">
              <label>Subject Type</label>
              <select data-sidx="${sIdx}" data-field="isOptional">
                <option value="false" ${!subj.isOptional ? "selected" : ""}>Compulsory Subject</option>
                <option value="true" ${subj.isOptional ? "selected" : ""}>Optional (4th Subject)</option>
              </select>
            </div>
            <div class="form-group">
              <label>Pass Rule Override</label>
              <select data-sidx="${sIdx}" data-field="passMode">
                <option value="inherit" ${subj.passMode === "inherit" ? "selected" : ""}>Use Active Rule</option>
                <option value="individual_and_combined" ${subj.passMode === "individual_and_combined" ? "selected" : ""}>Each Component + Combined</option>
                <option value="combined_only" ${subj.passMode === "combined_only" ? "selected" : ""}>Combined Marks Only</option>
              </select>
            </div>
            <div class="form-group">
              <label>Weight / Subject Pass %</label>
              <div class="inline-control">
                <input type="number" min="0.1" max="5" step="0.05" title="Subject Weighting" data-sidx="${sIdx}" data-field="weight" value="${subj.weight}" />
                <input type="number" min="0" max="100" step="0.5" title="Custom Subject Pass %" placeholder="Pass %" data-sidx="${sIdx}" data-field="subjPassPercent" value="${subj.passPercent}" />
              </div>
            </div>
            <div>
              <button type="button" class="btn btn-danger-outline btn-sm" data-action="remove-subject" data-sidx="${sIdx}">Remove Subject</button>
            </div>
          </div>

          <table class="components-table">
            <thead>
              <tr>
                <th>Component Name (MCQ, CQ, Practical, Viva...)</th>
                <th>Max Marks</th>
                <th>Obtained Marks</th>
                <th>Min Pass % (Optional)</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>${compRows}</tbody>
          </table>

          <div class="subject-footer-summary">
            <button type="button" class="btn btn-outline btn-sm" data-action="add-comp" data-sidx="${sIdx}">+ Add Component</button>
            <div class="subject-calc-badges" id="subjSummary_${sIdx}"></div>
          </div>
        </div>`;
      })
      .join("");

    updateLivePreview();
  }

  function updateLivePreview() {
    const studentClass = document.getElementById("studentClass").value;
    const studentGroup = document.getElementById("studentGroup").value;
    const examName = document.getElementById("examName").value;
    const academicYear = document.getElementById("academicYear").value;

    const activeRule = findApplicableRule(studentClass, studentGroup, examName, academicYear);
    document.getElementById("activeRuleBadge").textContent = `Active Rule: ${activeRule.profileName}`;

    const evaluation = evaluateStudentResult(appState.draftSubjects, activeRule);

    evaluation.subjects.forEach((evSubj, idx) => {
      const target = document.getElementById(`subjSummary_${idx}`);
      if (target) {
        target.innerHTML = `
          <span>Total: <strong>${evSubj.obtainedMarks} / ${evSubj.maxMarks}</strong> (${evSubj.percentage}%)</span>
          <span>Grade: <strong>${escapeHtml(evSubj.grade)}</strong> (${evSubj.gradePoint.toFixed(2)})</span>
          <span class="status-pill ${evSubj.passed ? "pass" : "fail"}">${evSubj.passed ? "PASS" : "FAIL"}</span>
        `;
      }
    });

    document.getElementById("previewGrandTotal").textContent = `${evaluation.grandObtained} / ${evaluation.grandMax}`;
    document.getElementById("previewSubjectCount").textContent = `${evaluation.subjectCount} (${evaluation.compulsoryCount} Comp.)`;
    document.getElementById("previewBaseGpa").textContent = evaluation.baseGpa.toFixed(2);
    document.getElementById("previewFinalGpa").textContent = evaluation.finalGpa.toFixed(2);
    document.getElementById("previewFinalGrade").textContent = evaluation.finalGrade;

    const statusEl = document.getElementById("previewFinalStatus");
    statusEl.textContent = evaluation.finalStatus;
    statusEl.className = `status-pill ${evaluation.finalStatus === "PASS" ? "pass" : "fail"}`;
  }

  function applySubjectPreset(presetKey) {
    if (!presetKey) return;
    if (presetKey === "nctb_secondary") {
      appState.draftSubjects = [
        createSubjectObject("Bengali 1st Paper", [
          createComponentObject("CQ", 70, 0),
          createComponentObject("MCQ", 30, 0)
        ]),
        createSubjectObject("Bengali 2nd Paper", [
          createComponentObject("CQ", 70, 0),
          createComponentObject("MCQ", 30, 0)
        ]),
        createSubjectObject("English 1st Paper", [
          createComponentObject("Written", 100, 0)
        ]),
        createSubjectObject("English 2nd Paper", [
          createComponentObject("Written", 100, 0)
        ]),
        createSubjectObject("Mathematics", [
          createComponentObject("CQ", 70, 0),
          createComponentObject("MCQ", 30, 0)
        ]),
        createSubjectObject("ICT", [
          createComponentObject("MCQ", 25, 0),
          createComponentObject("Practical", 25, 0)
        ]),
        createSubjectObject("Higher Mathematics / Agriculture (Optional)", [
          createComponentObject("CQ", 50, 0),
          createComponentObject("MCQ", 25, 0),
          createComponentObject("Practical", 25, 0)
        ], true)
      ];
    } else if (presetKey === "primary_general") {
      appState.draftSubjects = [
        createSubjectObject("Bangla", [createComponentObject("Written", 100, 0)]),
        createSubjectObject("English", [createComponentObject("Written", 100, 0)]),
        createSubjectObject("Mathematics", [createComponentObject("Written", 100, 0)]),
        createSubjectObject("Elementary Science", [createComponentObject("Written", 100, 0)]),
        createSubjectObject("Bangladesh & Global Studies", [createComponentObject("Written", 100, 0)]),
        createSubjectObject("Religion & Moral Education", [createComponentObject("Written", 100, 0)])
      ];
    } else if (presetKey === "kg_basic") {
      appState.draftSubjects = [
        createSubjectObject("Bangla", [createComponentObject("Written", 80, 0), createComponentObject("Oral / Viva", 20, 0)]),
        createSubjectObject("English", [createComponentObject("Written", 80, 0), createComponentObject("Oral / Viva", 20, 0)]),
        createSubjectObject("Mathematics", [createComponentObject("Written", 80, 0), createComponentObject("Oral / Viva", 20, 0)]),
        createSubjectObject("General Knowledge & Drawing", [createComponentObject("Practical / Viva", 50, 0)])
      ];
    }
    renderDraftSubjects();
    showToast("Subject preset loaded. Enter obtained marks below.", "info");
  }

  function resetStudentForm() {
    document.getElementById("editingRecordId").value = "";
    document.getElementById("studentFormTitle").textContent = "1. Student & Examination Information";
    document.getElementById("saveResultBtn").innerHTML = "&#128190; Save Examination Result";
    document.getElementById("studentName").value = "";
    document.getElementById("studentId").value = "";
    document.getElementById("rollNumber").value = "";
    document.getElementById("examName").value = appState.settings.defaultExam || "";
    document.getElementById("academicYear").value = appState.settings.defaultYear || String(new Date().getFullYear());

    appState.draftSubjects = [
      createSubjectObject("Bengali 1st Paper", [
        createComponentObject("CQ", 70, 0),
        createComponentObject("MCQ", 30, 0)
      ])
    ];
    renderDraftSubjects();
  }

  function handleSaveStudentResult(e) {
    e.preventDefault();

    const editingId = document.getElementById("editingRecordId").value.trim();
    const studentName = document.getElementById("studentName").value.trim();
    const studentId = document.getElementById("studentId").value.trim();
    const rollNumber = document.getElementById("rollNumber").value.trim();
    const studentClass = document.getElementById("studentClass").value;
    const studentGroup = document.getElementById("studentGroup").value;
    const examName = document.getElementById("examName").value.trim();
    const academicYear = document.getElementById("academicYear").value.trim();

    if (!studentName || !studentId || !rollNumber || !examName || !academicYear) {
      showToast("Please fill in all required student and examination fields.", "error");
      return;
    }

    if (appState.draftSubjects.length === 0) {
      showToast("Please add at least one subject before saving.", "error");
      return;
    }

    // Validate subjects & marks
    for (const subj of appState.draftSubjects) {
      if (!subj.name || !subj.name.trim()) {
        showToast("Every subject must have a valid name.", "error");
        return;
      }
      if (!subj.components || subj.components.length === 0) {
        showToast(`Subject "${subj.name}" must have at least one component.`, "error");
        return;
      }
      for (const comp of subj.components) {
        const maxM = Number(comp.maxMarks);
        const obtM = Number(comp.obtainedMarks);
        if (isNaN(maxM) || maxM <= 0) {
          showToast(`Invalid maximum marks in "${subj.name} - ${comp.name}".`, "error");
          return;
        }
        if (isNaN(obtM) || obtM < 0) {
          showToast(`Obtained marks cannot be negative in "${subj.name} - ${comp.name}".`, "error");
          return;
        }
        if (obtM > maxM) {
          showToast(`Obtained marks (${obtM}) cannot exceed maximum marks (${maxM}) in "${subj.name} - ${comp.name}".`, "error");
          return;
        }
      }
    }

    // Prevent duplicate record for same studentId + class + exam + academicYear
    const duplicate = appState.records.find(
      (rec) =>
        rec.id !== editingId &&
        rec.studentId.trim().toLowerCase() === studentId.toLowerCase() &&
        rec.studentClass === studentClass &&
        rec.examName.trim().toLowerCase() === examName.toLowerCase() &&
        rec.academicYear.trim().toLowerCase() === academicYear.toLowerCase()
    );

    if (duplicate) {
      showToast(
        `Duplicate blocked: Record already exists for Student ID "${studentId}" in ${studentClass} (${examName} ${academicYear}). Edit the existing record instead.`,
        "error"
      );
      return;
    }

    const applicableRule = findApplicableRule(studentClass, studentGroup, examName, academicYear);
    const evaluated = evaluateStudentResult(appState.draftSubjects, applicableRule);

    const recordPayload = {
      id: editingId || generateId("res"),
      studentName,
      studentId,
      rollNumber,
      studentClass,
      studentGroup,
      examName,
      academicYear,
      ...evaluated,
      updatedAt: new Date().toISOString()
    };

    if (editingId) {
      const index = appState.records.findIndex((r) => r.id === editingId);
      if (index !== -1) {
        appState.records[index] = recordPayload;
        showToast("Student result record updated successfully.", "success");
      }
    } else {
      appState.records.push(recordPayload);
      showToast("Student result record saved successfully.", "success");
    }

    saveRecords();
    resetStudentForm();
    renderRecordsTable();
    renderDashboard();
  }

  function renderRecordsTable() {
    const tbody = document.getElementById("studentRecordsTableBody");
    const searchQuery = (document.getElementById("searchStudentInput").value || "").trim().toLowerCase();
    const classFilter = document.getElementById("filterClassSelect").value;

    const filtered = appState.records.filter((rec) => {
      if (classFilter && rec.studentClass !== classFilter) return false;
      if (!searchQuery) return true;
      return (
        rec.studentName.toLowerCase().includes(searchQuery) ||
        rec.studentId.toLowerCase().includes(searchQuery) ||
        rec.rollNumber.toLowerCase().includes(searchQuery) ||
        rec.examName.toLowerCase().includes(searchQuery)
      );
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty-state">No matching student result records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered
      .map(
        (rec) => `
      <tr>
        <td><strong>${escapeHtml(rec.studentId)}</strong></td>
        <td>${escapeHtml(rec.rollNumber)}</td>
        <td>${escapeHtml(rec.studentName)}</td>
        <td>${escapeHtml(rec.studentClass)} (${escapeHtml(rec.studentGroup)})</td>
        <td>${escapeHtml(rec.examName)} (${escapeHtml(rec.academicYear)})</td>
        <td>${rec.subjectCount}</td>
        <td>${rec.grandObtained} / ${rec.grandMax}</td>
        <td><strong>${Number(rec.finalGpa).toFixed(2)}</strong></td>
        <td>${escapeHtml(rec.finalGrade)}</td>
        <td><span class="status-pill ${rec.finalStatus === "PASS" ? "pass" : "fail"}">${rec.finalStatus}</span></td>
        <td>
          <div class="action-btn-group">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.appActions.openMarksheet('${rec.id}')">Marksheet</button>
            <button type="button" class="btn btn-outline btn-sm" onclick="window.appActions.editRecord('${rec.id}')">Edit</button>
            <button type="button" class="btn btn-danger-outline btn-sm" onclick="window.appActions.deleteRecord('${rec.id}')">Delete</button>
          </div>
        </td>
      </tr>`
      )
      .join("");
  }

  /* --------------------------------------------------------------------------
     Section 3: Grading Rules Management
     -------------------------------------------------------------------------- */
  function renderGradeScaleEditor(scaleArray) {
    const tbody = document.getElementById("gradeScaleTableBody");
    tbody.innerHTML = scaleArray
      .map(
        (band, idx) => `
      <tr>
        <td><input type="number" step="0.01" min="0" max="100" class="gs-min" value="${band.min}" required /></td>
        <td><input type="number" step="0.01" min="0" max="100" class="gs-max" value="${band.max}" required /></td>
        <td><input type="text" class="gs-grade" value="${escapeHtml(band.grade)}" required /></td>
        <td><input type="number" step="0.01" min="0" max="10" class="gs-point" value="${band.point}" required /></td>
        <td>
          <button type="button" class="btn btn-danger-outline btn-sm" onclick="this.closest('tr').remove()" ${scaleArray.length <= 1 ? "disabled" : ""}>&times;</button>
        </td>
      </tr>`
      )
      .join("");
  }

  function resetRuleForm() {
    document.getElementById("editingRuleId").value = "";
    document.getElementById("ruleFormTitle").textContent = "Create New Rule Profile";
    document.getElementById("ruleProfileName").value = "";
    document.getElementById("ruleClass").value = "ALL";
    document.getElementById("ruleGroup").value = "ALL";
    document.getElementById("ruleExamName").value = "";
    document.getElementById("ruleAcademicYear").value = "";
    document.getElementById("ruleSubjectPassPercent").value = 33;
    document.getElementById("ruleComponentPassPercent").value = 33;
    document.getElementById("rulePassMode").value = "individual_and_combined";
    document.getElementById("ruleOptionalEnabled").value = "true";
    document.getElementById("ruleOptionalThreshold").value = 2.0;
    document.getElementById("ruleMaxGpa").value = 5.0;
    renderGradeScaleEditor(DEFAULT_GRADE_SCALE);
  }

  function handleSaveGradingRule(e) {
    e.preventDefault();
    const editingRuleId = document.getElementById("editingRuleId").value.trim();
    const profileName = document.getElementById("ruleProfileName").value.trim();
    if (!profileName) {
      showToast("Rule profile name is required.", "error");
      return;
    }

    const rows = Array.from(document.querySelectorAll("#gradeScaleTableBody tr"));
    if (rows.length === 0) {
      showToast("At least one grade band is required.", "error");
      return;
    }

    const gradeScale = rows.map((tr) => ({
      min: Number(tr.querySelector(".gs-min").value),
      max: Number(tr.querySelector(".gs-max").value),
      grade: tr.querySelector(".gs-grade").value.trim(),
      point: Number(tr.querySelector(".gs-point").value)
    }));

    const ruleObj = {
      id: editingRuleId || generateId("rule"),
      profileName,
      applicableClass: document.getElementById("ruleClass").value,
      applicableGroup: document.getElementById("ruleGroup").value,
      examName: document.getElementById("ruleExamName").value.trim(),
      academicYear: document.getElementById("ruleAcademicYear").value.trim(),
      subjectPassPercent: Number(document.getElementById("ruleSubjectPassPercent").value),
      componentPassPercent: Number(document.getElementById("ruleComponentPassPercent").value),
      passMode: document.getElementById("rulePassMode").value,
      optionalEnabled: document.getElementById("ruleOptionalEnabled").value === "true",
      optionalThreshold: Number(document.getElementById("ruleOptionalThreshold").value),
      maxGpa: Number(document.getElementById("ruleMaxGpa").value),
      gradeScale
    };

    if (editingRuleId) {
      const idx = appState.rules.findIndex((r) => r.id === editingRuleId);
      if (idx !== -1) appState.rules[idx] = ruleObj;
    } else {
      appState.rules.push(ruleObj);
    }

    saveRules();
    recalculateAllRecords();
    renderSavedRulesTable();
    renderDashboard();
    showToast("Grading rule saved and existing results recalculated.", "success");
  }

  function renderSavedRulesTable() {
    const tbody = document.getElementById("savedRulesTableBody");
    tbody.innerHTML = appState.rules
      .map(
        (rule) => `
      <tr>
        <td><strong>${escapeHtml(rule.profileName)}</strong></td>
        <td>
          Class: ${escapeHtml(rule.applicableClass)} | Group: ${escapeHtml(rule.applicableGroup)}<br/>
          <small class="muted">Exam: ${escapeHtml(rule.examName || "All")} | Year: ${escapeHtml(rule.academicYear || "All")}</small>
        </td>
        <td>Subject: ${rule.subjectPassPercent}% | Comp: ${rule.componentPassPercent}%</td>
        <td>${rule.passMode === "individual_and_combined" ? "Component + Combined" : "Combined Only"}</td>
        <td>${rule.optionalEnabled ? `Enabled (> ${Number(rule.optionalThreshold).toFixed(2)} GP)` : "Disabled"}</td>
        <td>
          <div class="action-btn-group">
            <button type="button" class="btn btn-outline btn-sm" onclick="window.appActions.editRule('${rule.id}')">Edit</button>
            <button type="button" class="btn btn-danger-outline btn-sm" onclick="window.appActions.deleteRule('${rule.id}')" ${appState.rules.length <= 1 ? "disabled" : ""}>Delete</button>
          </div>
        </td>
      </tr>`
      )
      .join("");
  }

  /* --------------------------------------------------------------------------
     Section 4: Class-Wise Merit List
     -------------------------------------------------------------------------- */
  function populateMeritFilterDropdowns() {
    const exams = [...new Set(appState.records.map((r) => r.examName).filter(Boolean))];
    const years = [...new Set(appState.records.map((r) => r.academicYear).filter(Boolean))];

    const examSel = document.getElementById("meritExamSelect");
    const prevExam = examSel.value;
    examSel.innerHTML = `<option value="">-- Select Examination --</option>` +
      exams.map((ex) => `<option value="${escapeHtml(ex)}">${escapeHtml(ex)}</option>`).join("");
    if (exams.includes(prevExam)) examSel.value = prevExam;
    else if (exams.length > 0) examSel.value = exams[0];

    const yearSel = document.getElementById("meritYearSelect");
    const prevYear = yearSel.value;
    yearSel.innerHTML = `<option value="">-- Select Year --</option>` +
      years.map((yr) => `<option value="${escapeHtml(yr)}">${escapeHtml(yr)}</option>`).join("");
    if (years.includes(prevYear)) yearSel.value = prevYear;
    else if (years.length > 0) yearSel.value = years[0];
  }

  function generateMeritList() {
    const selectedClass = document.getElementById("meritClassSelect").value;
    const selectedGroup = document.getElementById("meritGroupSelect").value;
    const selectedExam = document.getElementById("meritExamSelect").value;
    const selectedYear = document.getElementById("meritYearSelect").value;

    if (!selectedExam || !selectedYear) {
      showToast("Please select both Examination Name and Academic Year.", "error");
      return;
    }

    const matching = appState.records.filter((r) => {
      if (r.studentClass !== selectedClass) return false;
      if (selectedGroup !== "ALL" && r.studentGroup !== selectedGroup) return false;
      if (r.examName !== selectedExam) return false;
      if (r.academicYear !== selectedYear) return false;
      return true;
    });

    // Strict sorting: PASS before FAIL -> Higher Final GPA -> Higher Grand Obtained -> Roll Number ascending
    const sorted = [...matching].sort((a, b) => {
      const aPass = a.finalStatus === "PASS" ? 1 : 0;
      const bPass = b.finalStatus === "PASS" ? 1 : 0;
      if (bPass !== aPass) return bPass - aPass;

      if (b.finalGpa !== a.finalGpa) return b.finalGpa - a.finalGpa;
      if (b.grandObtained !== a.grandObtained) return b.grandObtained - a.grandObtained;

      return String(a.rollNumber).localeCompare(String(b.rollNumber), undefined, { numeric: true });
    });

    // Standard Competition Ranking (1, 2, 2, 4) for passed students; "—" for failed students
    let passedRankCounter = 0;
    let lastGpa = null;
    let lastTotal = null;
    let currentDisplayedRank = 0;

    const rankedList = sorted.map((rec) => {
      if (rec.finalStatus === "PASS") {
        passedRankCounter += 1;
        if (rec.finalGpa !== lastGpa || rec.grandObtained !== lastTotal) {
          currentDisplayedRank = passedRankCounter;
          lastGpa = rec.finalGpa;
          lastTotal = rec.grandObtained;
        }
        return { ...rec, meritPosition: currentDisplayedRank };
      }
      return { ...rec, meritPosition: "—" };
    });

    appState.currentMeritList = rankedList;
    document.getElementById("meritListHeading").textContent =
      `Merit List: ${selectedClass} (${selectedGroup === "ALL" ? "All Groups" : selectedGroup}) — ${selectedExam} ${selectedYear}`;

    const tbody = document.getElementById("meritListTableBody");
    const exportBtn = document.getElementById("exportMeritCsvBtn");

    if (rankedList.length === 0) {
      exportBtn.disabled = true;
      tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No student records found for the selected Class, Examination, and Year.</td></tr>`;
      return;
    }

    exportBtn.disabled = false;
    tbody.innerHTML = rankedList
      .map(
        (rec) => `
      <tr>
        <td><strong>${rec.meritPosition}</strong></td>
        <td>${escapeHtml(rec.studentId)}</td>
        <td>${escapeHtml(rec.rollNumber)}</td>
        <td><strong>${escapeHtml(rec.studentName)}</strong></td>
        <td>${escapeHtml(rec.studentGroup)}</td>
        <td>${rec.grandObtained} / ${rec.grandMax}</td>
        <td><strong>${Number(rec.finalGpa).toFixed(2)}</strong></td>
        <td>${escapeHtml(rec.finalGrade)}</td>
        <td><span class="status-pill ${rec.finalStatus === "PASS" ? "pass" : "fail"}">${rec.finalStatus}</span></td>
        <td>
          <button type="button" class="btn btn-outline btn-sm" onclick="window.appActions.openMarksheet('${rec.id}')">View</button>
        </td>
      </tr>`
      )
      .join("");
  }

  /* --------------------------------------------------------------------------
     Section 5: Individual Marksheet (A4 Printable)
     -------------------------------------------------------------------------- */
  function populateMarksheetDropdown(filterText = "") {
    const dropdown = document.getElementById("marksheetSelectDropdown");
    const q = filterText.trim().toLowerCase();

    const filtered = appState.records.filter((r) => {
      if (!q) return true;
      return (
        r.studentName.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q) ||
        r.rollNumber.toLowerCase().includes(q)
      );
    });

    dropdown.innerHTML =
      `<option value="">-- Choose a Student Result Record (${filtered.length} found) --</option>` +
      filtered
        .map(
          (r) =>
            `<option value="${r.id}">${escapeHtml(r.studentName)} | ID: ${escapeHtml(r.studentId)} | Roll: ${escapeHtml(r.rollNumber)} | ${escapeHtml(r.studentClass)} (${escapeHtml(r.examName)} ${escapeHtml(r.academicYear)})</option>`
        )
        .join("");
  }

  function renderIndividualMarksheet(recordId) {
    const container = document.getElementById("marksheetPrintableArea");
    const printBtn = document.getElementById("printMarksheetBtn");
    const record = appState.records.find((r) => r.id === recordId);

    if (!record) {
      printBtn.disabled = true;
      container.innerHTML = `<div class="empty-marksheet-notice">Select a student result record above to generate the official A4 marksheet.</div>`;
      return;
    }

    printBtn.disabled = false;
    const rule = appState.rules.find((rl) => rl.id === record.ruleId) || appState.rules[0] || DEFAULT_RULE_PROFILE;
    const { schoolName, address, principalTitle, logoDataUrl } = appState.settings;

    const logoHtml = logoDataUrl
      ? `<img src="${logoDataUrl}" alt="School Logo" class="ms-logo" />`
      : `<div class="ms-logo-placeholder">BA</div>`;

    const gradeLegendRows = [...rule.gradeScale]
      .sort((a, b) => Number(b.min) - Number(a.min))
      .map((b) => `<tr><td>${b.min}-${Math.floor(b.max)}</td><td>${escapeHtml(b.grade)}</td><td>${Number(b.point).toFixed(2)}</td></tr>`)
      .join("");

    const subjectRows = record.subjects
      .map((subj, index) => {
        let cqMarks = 0, cqMax = 0, hasCq = false;
        let mcqMarks = 0, mcqMax = 0, hasMcq = false;
        let pracMarks = 0, pracMax = 0, hasPrac = false;
        const otherNotes = [];

        (subj.components || []).forEach((c) => {
          const cname = (c.name || "").trim().toLowerCase();
          const obt = Number(c.obtainedMarks) || 0;
          const mx = Number(c.maxMarks) || 0;

          if (cname === "cq" || cname.includes("creative") || cname === "written" || cname.includes("subjective")) {
            cqMarks = roundTwo(cqMarks + obt);
            cqMax = roundTwo(cqMax + mx);
            hasCq = true;
          } else if (cname === "mcq" || cname.includes("multiple") || cname.includes("objective")) {
            mcqMarks = roundTwo(mcqMarks + obt);
            mcqMax = roundTwo(mcqMax + mx);
            hasMcq = true;
          } else if (cname.includes("prac") || cname.includes("viva") || cname.includes("oral") || cname.includes("lab")) {
            pracMarks = roundTwo(pracMarks + obt);
            pracMax = roundTwo(pracMax + mx);
            hasPrac = true;
          } else {
            otherNotes.push(`${escapeHtml(c.name)}: ${obt}/${mx}`);
          }
        });

        const cqDisplay = hasCq ? `${cqMarks}/${cqMax}` : "—";
        const mcqDisplay = hasMcq ? `${mcqMarks}/${mcqMax}` : "—";
        const pracDisplay = hasPrac ? `${pracMarks}/${pracMax}` : "—";
        const totalDisplay = `<strong>${subj.obtainedMarks}</strong> / ${subj.maxMarks}`;

        return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>
            <strong>${escapeHtml(subj.name)}</strong>
            ${subj.isOptional ? `<span class="badge badge-info">Optional (4th)</span>` : ""}
            ${otherNotes.length > 0 ? `<div style="font-size:10.5px; color:#475569;">(${otherNotes.join(", ")})</div>` : ""}
          </td>
          <td class="num">${cqDisplay}</td>
          <td class="num">${mcqDisplay}</td>
          <td class="num">${pracDisplay}</td>
          <td class="num">${totalDisplay}</td>
          <td class="num">${subj.percentage}%</td>
          <td class="num"><strong>${escapeHtml(subj.grade)}</strong></td>
          <td class="num">${Number(subj.gradePoint).toFixed(2)}</td>
          <td class="num">${subj.passed ? "PASS" : "FAIL"}</td>
        </tr>`;
      })
      .join("");

    container.innerHTML = `
      <div class="a4-sheet">
        <div class="sheet-inner-border">
          <div>
            <div class="ms-header">
              ${logoHtml}
              <div class="ms-title-block">
                <h1>${escapeHtml(schoolName)}</h1>
                ${address ? `<div class="ms-address">${escapeHtml(address)}</div>` : ""}
                <div class="ms-doc-badge">ACADEMIC TRANSCRIPT / MARKSHEET</div>
                <div style="margin-top:5px; font-weight:700; font-size:13px;">
                  ${escapeHtml(record.examName)} — ${escapeHtml(record.academicYear)}
                </div>
              </div>
              <table class="ms-grade-legend">
                <thead>
                  <tr><th>Marks %</th><th>Grade</th><th>GP</th></tr>
                </thead>
                <tbody>${gradeLegendRows}</tbody>
              </table>
            </div>

            <div class="ms-student-grid">
              <div class="ms-student-row"><span>Student Name:</span><strong>${escapeHtml(record.studentName)}</strong></div>
              <div class="ms-student-row"><span>Student ID:</span><strong>${escapeHtml(record.studentId)}</strong></div>
              <div class="ms-student-row"><span>Class:</span><strong>${escapeHtml(record.studentClass)}</strong></div>
              <div class="ms-student-row"><span>Roll Number:</span><strong>${escapeHtml(record.rollNumber)}</strong></div>
              <div class="ms-student-row"><span>Group:</span><strong>${escapeHtml(record.studentGroup)}</strong></div>
              <div class="ms-student-row"><span>Academic Year:</span><strong>${escapeHtml(record.academicYear)}</strong></div>
            </div>

            <table class="ms-marks-table">
              <thead>
                <tr>
                  <th>SL</th>
                  <th>Subject Name</th>
                  <th>CQ</th>
                  <th>MCQ</th>
                  <th>Practical</th>
                  <th>Total Mark</th>
                  <th>%</th>
                  <th>Grade</th>
                  <th>Grade Point</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${subjectRows}</tbody>
            </table>

            <div class="ms-summary-box">
              <div class="ms-sum-cell">
                <span>Grand Total Marks</span>
                <strong>${record.grandObtained} / ${record.grandMax}</strong>
              </div>
              <div class="ms-sum-cell">
                <span>GPA (Without Optional)</span>
                <strong>${Number(record.baseGpa).toFixed(2)}</strong>
              </div>
              <div class="ms-sum-cell">
                <span>Overall GPA &amp; Grade</span>
                <strong>${Number(record.finalGpa).toFixed(2)} (${escapeHtml(record.finalGrade)})</strong>
              </div>
              <div class="ms-sum-cell">
                <span>Final Result Status</span>
                <strong style="color:${record.finalStatus === "PASS" ? "#15803d" : "#b91c1c"}">${record.finalStatus}</strong>
              </div>
            </div>
          </div>

          <div class="ms-signatures">
            <div class="sig-block">
              <div class="sig-line">Class Teacher</div>
            </div>
            <div class="sig-block">
              <div class="sig-line">Guardian's Signature</div>
            </div>
            <div class="sig-block">
              <div class="sig-line">${escapeHtml(principalTitle || "Head Teacher / Principal")}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* --------------------------------------------------------------------------
     Section 6: JSON Backup/Restore & CSV Export
     -------------------------------------------------------------------------- */
  function triggerFileDownload(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadJsonBackup() {
    const backupPayload = {
      application: "BARA AWLIA IDEAL KINDERGARTEN & HIGH SCHOOL - Result Management System",
      version: "1.0",
      exportedAt: new Date().toISOString(),
      settings: appState.settings,
      rules: appState.rules,
      records: appState.records
    };
    const dateStamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(
      `Bara_Awlia_Result_Backup_${dateStamp}.json`,
      JSON.stringify(backupPayload, null, 2),
      "application/json"
    );
    showToast("JSON backup downloaded successfully.", "success");
  }

  function handleRestoreJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (!parsed || !Array.isArray(parsed.records) || !Array.isArray(parsed.rules)) {
          throw new Error("Invalid backup structure.");
        }

        openConfirmModal(
          "Restore Application Backup",
          `This will replace current browser data with ${parsed.records.length} student result records and ${parsed.rules.length} grading rule profiles from the backup file. Continue?`,
          () => {
            appState.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
            appState.rules = parsed.rules.length > 0 ? parsed.rules : [JSON.parse(JSON.stringify(DEFAULT_RULE_PROFILE))];
            appState.records = parsed.records;

            saveSettings();
            saveRules();
            recalculateAllRecords();
            renderSchoolHeader();
            renderDashboard();
            renderRecordsTable();
            renderSavedRulesTable();
            showToast("Backup restored successfully.", "success");
          }
        );
      } catch (err) {
        showToast("Failed to restore JSON: File is invalid or corrupted.", "error");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function csvEscape(val) {
    const str = val === null || val === undefined ? "" : String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function exportAllResultsCsv() {
    if (appState.records.length === 0) {
      showToast("No student result records available to export.", "error");
      return;
    }
    const headers = [
      "Student ID",
      "Roll Number",
      "Student Name",
      "Class",
      "Group",
      "Examination",
      "Academic Year",
      "Subjects Count",
      "Grand Obtained",
      "Grand Max",
      "Base GPA",
      "Final GPA",
      "Final Grade",
      "Final Result"
    ];

    const rows = appState.records.map((r) => [
      r.studentId,
      r.rollNumber,
      r.studentName,
      r.studentClass,
      r.studentGroup,
      r.examName,
      r.academicYear,
      r.subjectCount,
      r.grandObtained,
      r.grandMax,
      Number(r.baseGpa).toFixed(2),
      Number(r.finalGpa).toFixed(2),
      r.finalGrade,
      r.finalStatus
    ]);

    const csvString = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    triggerFileDownload("Bara_Awlia_All_Student_Results.csv", csvString, "text/csv;charset=utf-8;");
    showToast("All student results exported as CSV.", "success");
  }

  function exportMeritListCsv() {
    if (!appState.currentMeritList || appState.currentMeritList.length === 0) {
      showToast("Generate a merit list first before exporting.", "error");
      return;
    }

    const headers = [
      "Merit Position",
      "Student ID",
      "Roll Number",
      "Student Name",
      "Class",
      "Group",
      "Examination",
      "Academic Year",
      "Obtained Marks",
      "Full Marks",
      "Final GPA",
      "Final Grade",
      "Final Result"
    ];

    const rows = appState.currentMeritList.map((r) => [
      r.meritPosition,
      r.studentId,
      r.rollNumber,
      r.studentName,
      r.studentClass,
      r.studentGroup,
      r.examName,
      r.academicYear,
      r.grandObtained,
      r.grandMax,
      Number(r.finalGpa).toFixed(2),
      r.finalGrade,
      r.finalStatus
    ]);

    const csvString = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    const cls = appState.currentMeritList[0].studentClass.replace(/\s+/g, "_");
    triggerFileDownload(`Merit_List_${cls}.csv`, csvString, "text/csv;charset=utf-8;");
    showToast("Class-wise merit list exported as CSV.", "success");
  }

  /* --------------------------------------------------------------------------
     Global Public Row Actions
     -------------------------------------------------------------------------- */
  window.appActions = {
    openMarksheet(recordId) {
      switchSection("marksheet");
      populateMarksheetDropdown();
      document.getElementById("marksheetSelectDropdown").value = recordId;
      renderIndividualMarksheet(recordId);
    },

    editRecord(recordId) {
      const rec = appState.records.find((r) => r.id === recordId);
      if (!rec) return;

      switchSection("students-marks");
      document.getElementById("editingRecordId").value = rec.id;
      document.getElementById("studentFormTitle").textContent = `Editing Record: ${rec.studentName} (${rec.studentId})`;
      document.getElementById("saveResultBtn").innerHTML = "&#10004; Update Examination Result";

      document.getElementById("studentName").value = rec.studentName;
      document.getElementById("studentId").value = rec.studentId;
      document.getElementById("rollNumber").value = rec.rollNumber;
      document.getElementById("studentClass").value = rec.studentClass;
      document.getElementById("studentGroup").value = rec.studentGroup;
      document.getElementById("examName").value = rec.examName;
      document.getElementById("academicYear").value = rec.academicYear;

      appState.draftSubjects = JSON.parse(JSON.stringify(rec.subjects || []));
      renderDraftSubjects();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    deleteRecord(recordId) {
      const rec = appState.records.find((r) => r.id === recordId);
      if (!rec) return;
      openConfirmModal(
        "Delete Student Result Record",
        `Are you sure you want to permanently delete the result record for "${rec.studentName}" (ID: ${rec.studentId}, ${rec.examName} ${rec.academicYear})?`,
        () => {
          appState.records = appState.records.filter((r) => r.id !== recordId);
          saveRecords();
          renderRecordsTable();
          renderDashboard();
          showToast("Student result record deleted.", "info");
        }
      );
    },

    editRule(ruleId) {
      const rule = appState.rules.find((r) => r.id === ruleId);
      if (!rule) return;
      document.getElementById("editingRuleId").value = rule.id;
      document.getElementById("ruleFormTitle").textContent = `Editing Rule: ${rule.profileName}`;
      document.getElementById("ruleProfileName").value = rule.profileName;
      document.getElementById("ruleClass").value = rule.applicableClass;
      document.getElementById("ruleGroup").value = rule.applicableGroup;
      document.getElementById("ruleExamName").value = rule.examName || "";
      document.getElementById("ruleAcademicYear").value = rule.academicYear || "";
      document.getElementById("ruleSubjectPassPercent").value = rule.subjectPassPercent;
      document.getElementById("ruleComponentPassPercent").value = rule.componentPassPercent;
      document.getElementById("rulePassMode").value = rule.passMode;
      document.getElementById("ruleOptionalEnabled").value = String(rule.optionalEnabled);
      document.getElementById("ruleOptionalThreshold").value = rule.optionalThreshold;
      document.getElementById("ruleMaxGpa").value = rule.maxGpa;
      renderGradeScaleEditor(rule.gradeScale);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    deleteRule(ruleId) {
      if (appState.rules.length <= 1) {
        showToast("At least one grading rule profile must remain active.", "error");
        return;
      }
      const rule = appState.rules.find((r) => r.id === ruleId);
      if (!rule) return;

      openConfirmModal(
        "Delete Grading Rule Profile",
        `Delete grading rule "${rule.profileName}"? Existing student records will be recalculated using the remaining fallback rules.`,
        () => {
          appState.rules = appState.rules.filter((r) => r.id !== ruleId);
          saveRules();
          recalculateAllRecords();
          renderSavedRulesTable();
          renderDashboard();
          showToast("Grading rule deleted and records updated.", "info");
        }
      );
    }
  };

  /* --------------------------------------------------------------------------
     Event Listeners Initialization
     -------------------------------------------------------------------------- */
  function bindEvents() {
    // Navigation
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchSection(btn.dataset.section));
    });

    document.querySelectorAll("[data-nav-target]").forEach((btn) => {
      btn.addEventListener("click", () => switchSection(btn.dataset.navTarget));
    });

    document.getElementById("mobileMenuBtn").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });

    // School Logo Upload & Remove
    document.getElementById("schoolLogoInput").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024 * 1.5) {
        showToast("Please select a logo image smaller than 1.5 MB.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = function (evt) {
        appState.settings.logoDataUrl = evt.target.result;
        saveSettings();
        renderSchoolHeader();
        showToast("School logo uploaded and saved locally.", "success");
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("removeLogoBtn").addEventListener("click", () => {
      appState.settings.logoDataUrl = "";
      saveSettings();
      renderSchoolHeader();
      showToast("School logo removed.", "info");
    });

    // School Settings Save
    document.getElementById("schoolSettingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      appState.settings.schoolName = document.getElementById("settingSchoolName").value.trim() || DEFAULT_SETTINGS.schoolName;
      appState.settings.address = document.getElementById("settingSchoolAddress").value.trim();
      appState.settings.defaultExam = document.getElementById("settingDefaultExam").value.trim();
      appState.settings.defaultYear = document.getElementById("settingDefaultYear").value.trim();
      appState.settings.principalTitle = document.getElementById("settingPrincipalTitle").value.trim() || "Head Teacher / Principal";
      saveSettings();
      renderSchoolHeader();
      showToast("School & examination settings saved.", "success");
    });

    // Student & Marks Form Events
    document.getElementById("addSubjectBtn").addEventListener("click", () => {
      appState.draftSubjects.push(createSubjectObject(""));
      renderDraftSubjects();
    });

    document.getElementById("applyPresetBtn").addEventListener("click", () => {
      const preset = document.getElementById("subjectTemplateSelect").value;
      applySubjectPreset(preset);
    });

    document.getElementById("resetStudentFormBtn").addEventListener("click", resetStudentForm);

    ["studentClass", "studentGroup", "examName", "academicYear"].forEach((id) => {
      document.getElementById(id).addEventListener("change", updateLivePreview);
      document.getElementById(id).addEventListener("input", updateLivePreview);
    });

    // Delegated Input & Button Events inside Subjects Builder
    const subjectsContainer = document.getElementById("subjectsContainer");
    subjectsContainer.addEventListener("input", (e) => {
      const target = e.target;
      const sIdx = Number(target.dataset.sidx);
      const cIdx = target.dataset.cidx !== undefined ? Number(target.dataset.cidx) : null;
      const field = target.dataset.field;
      if (isNaN(sIdx) || !appState.draftSubjects[sIdx]) return;

      const subj = appState.draftSubjects[sIdx];

      if (field === "subjName") subj.name = target.value;
      if (field === "weight") subj.weight = target.value;
      if (field === "subjPassPercent") subj.passPercent = target.value;

      if (cIdx !== null && subj.components[cIdx]) {
        const comp = subj.components[cIdx];
        if (field === "compName") comp.name = target.value;
        if (field === "maxMarks") {
          comp.maxMarks = Number(target.value);
          const obtInput = target.closest("tr").querySelector('[data-field="obtainedMarks"]');
          if (obtInput) obtInput.max = comp.maxMarks;
        }
        if (field === "obtainedMarks") {
          comp.obtainedMarks = Number(target.value);
        }
        if (field === "compPassPercent") {
          comp.passPercent = target.value;
        }
      }
      updateLivePreview();
    });

    subjectsContainer.addEventListener("change", (e) => {
      const target = e.target;
      const sIdx = Number(target.dataset.sidx);
      const field = target.dataset.field;
      if (isNaN(sIdx) || !appState.draftSubjects[sIdx]) return;

      if (field === "isOptional") {
        appState.draftSubjects[sIdx].isOptional = target.value === "true";
        updateLivePreview();
      }
      if (field === "passMode") {
        appState.draftSubjects[sIdx].passMode = target.value;
        updateLivePreview();
      }
    });

    subjectsContainer.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const sIdx = Number(btn.dataset.sidx);
      const cIdx = btn.dataset.cidx !== undefined ? Number(btn.dataset.cidx) : null;

      if (action === "remove-subject") {
        appState.draftSubjects.splice(sIdx, 1);
        renderDraftSubjects();
      } else if (action === "add-comp") {
        appState.draftSubjects[sIdx].components.push(createComponentObject("Practical", 25, 0, ""));
        renderDraftSubjects();
      } else if (action === "remove-comp" && cIdx !== null) {
        if (appState.draftSubjects[sIdx].components.length > 1) {
          appState.draftSubjects[sIdx].components.splice(cIdx, 1);
          renderDraftSubjects();
        }
      }
    });

    document.getElementById("studentResultForm").addEventListener("submit", handleSaveStudentResult);

    // Records Search & Filter
    document.getElementById("searchStudentInput").addEventListener("input", renderRecordsTable);
    document.getElementById("filterClassSelect").addEventListener("change", renderRecordsTable);

    // Grading Rules Form
    document.getElementById("newRuleBtn").addEventListener("click", resetRuleForm);
    document.getElementById("addGradeRowBtn").addEventListener("click", () => {
      const tbody = document.getElementById("gradeScaleTableBody");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="number" step="0.01" min="0" max="100" class="gs-min" value="0" required /></td>
        <td><input type="number" step="0.01" min="0" max="100" class="gs-max" value="0" required /></td>
        <td><input type="text" class="gs-grade" value="" placeholder="Grade" required /></td>
        <td><input type="number" step="0.01" min="0" max="10" class="gs-point" value="0.00" required /></td>
        <td><button type="button" class="btn btn-danger-outline btn-sm" onclick="this.closest('tr').remove()">&times;</button></td>
      `;
      tbody.appendChild(tr);
    });
    document.getElementById("gradingRuleForm").addEventListener("submit", handleSaveGradingRule);

    // Merit List
    document.getElementById("generateMeritBtn").addEventListener("click", generateMeritList);
    document.getElementById("exportMeritCsvBtn").addEventListener("click", exportMeritListCsv);

    // Marksheet
    document.getElementById("marksheetSearchInput").addEventListener("input", (e) => {
      populateMarksheetDropdown(e.target.value);
    });
    document.getElementById("loadMarksheetBtn").addEventListener("click", () => {
      const id = document.getElementById("marksheetSelectDropdown").value;
      renderIndividualMarksheet(id);
    });
    document.getElementById("marksheetSelectDropdown").addEventListener("change", (e) => {
      renderIndividualMarksheet(e.target.value);
    });
    document.getElementById("printMarksheetBtn").addEventListener("click", () => {
      window.print();
    });

    // Backup & Data
    document.getElementById("downloadJsonBackupBtn").addEventListener("click", downloadJsonBackup);
    document.getElementById("restoreJsonInput").addEventListener("change", handleRestoreJsonFile);
    document.getElementById("exportAllResultsCsvBtn").addEventListener("click", exportAllResultsCsv);

    document.getElementById("clearAllDataBtn").addEventListener("click", () => {
      openConfirmModal(
        "Clear All Local Application Data",
        "WARNING: This will permanently delete ALL saved students, examination marks, custom grading rules, and school settings from this browser. Download a JSON backup first if needed. Are you sure?",
        () => {
          localStorage.removeItem(STORAGE_KEYS.SETTINGS);
          localStorage.removeItem(STORAGE_KEYS.RECORDS);
          localStorage.removeItem(STORAGE_KEYS.RULES);

          appState.settings = { ...DEFAULT_SETTINGS };
          appState.records = [];
          appState.rules = [JSON.parse(JSON.stringify(DEFAULT_RULE_PROFILE))];
          appState.currentMeritList = [];

          saveRules();
          renderSchoolHeader();
          resetStudentForm();
          resetRuleForm();
          renderSavedRulesTable();
          renderRecordsTable();
          renderDashboard();
          showToast("All application data has been cleared.", "info");
        }
      );
    });

    // Confirm Modal Buttons
    document.getElementById("confirmCancelBtn").addEventListener("click", closeConfirmModal);
    document.getElementById("confirmOkBtn").addEventListener("click", () => {
      if (typeof pendingConfirmCallback === "function") {
        pendingConfirmCallback();
      }
      closeConfirmModal();
    });
  }

  /* --------------------------------------------------------------------------
     Bootstrap Application
     -------------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    loadState();
    bindEvents();
    renderSchoolHeader();
    resetStudentForm();
    resetRuleForm();
    renderSavedRulesTable();
    renderRecordsTable();
    renderDashboard();
  });
})();
