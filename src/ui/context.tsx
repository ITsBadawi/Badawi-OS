import { prepareLanguage, setUiLanguage } from "../localization.ts";
import { uiFormat, uiLabels, uiText } from "../localization.ts";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { AppSnapshot, Command } from "../contracts.ts";
const messages: Record<string, string> = uiLabels({
  GIT_PREVIEW_STALE: "تغيّر المشروع أو الملفات أو الحساب، أو انتهت المعاينة. اعرض التغييرات وراجع العملية من جديد.",
  GIT_INDEX_NOT_CLEAN: "توجد ملفات محضّرة مسبقاً في Git. راجعها خارج التطبيق قبل اختيار ملفات جديدة هنا.",
  GIT_PATH_DENIED: "لا يمكن ضم هذا المسار لأنه قد يحتوي سراً أو مساراً غير آمن.",
  GIT_FILE_DENIED: "هذا الملف رابط أو كبير جداً أو ليس ملفاً عادياً؛ راجعه خارج التطبيق.",
  GIT_ATTRIBUTES_DENIED: "يحتوي المستودع إعدادات سمات قد تشغّل مرشحات عند الحفظ؛ راجعها خارج التطبيق.",
  GIT_UNSAFE_CONFIG: "إعدادات Git في هذا المستودع تحتاج مراجعة قبل السماح بالحفظ أو الرفع.",
  GIT_AUTHOR_REQUIRED: "أدخل اسم الكاتب وبريده الصحيحين قبل مراجعة Commit.",
  GIT_SELECTION_INVALID: "اختر ملفات متغيرة متاحة، بحد أقصى 100 ملف لكل Commit.",
  GIT_CHANGE_STALE: "تغيّر الملف منذ عرضه؛ حدّث قائمة التغييرات.",
  GIT_STAGE_MISMATCH: "لم تطابق الملفات المحضّرة اختيارك. افحص حالة Git قبل المحاولة مجدداً.",
  GIT_COMMIT_UNCONFIRMED: "تعذر تأكيد Commit المحلي. افحص سجل Git قبل تكرار العملية.",
  GIT_PUBLISH_FAILED: "تعذرت عملية Git. افحص حالته واتصال GitHub ثم أعد المعاينة؛ قد يبقى Commit المحلي محفوظاً.",
  GIT_PUSH_TOKEN_REQUIRED: "احفظ رمز GitHub بصلاحية كتابة Contents للمستودع المرتبط قبل الرفع.",
  GIT_PUSH_TARGET_INVALID: "فرع المستودع المرتبط لا يطابق الفرع المحلي، أو لا توجد تغييرات جديدة للرفع.",
  GIT_PUSH_NOT_FAST_FORWARD: "الفرع البعيد ليس أصلاً للنسخة المحلية. راجع اختلاف النسختين قبل الرفع.",
  GIT_PUSH_UNCONFIRMED: "لم يمكن تأكيد الرفع. افحص GitHub قبل تكراره؛ بقي Commit المحلي محفوظاً.",
  WORKFLOW_REPLAY_CONFIRMATION_REQUIRED:
    "هذا التشغيل فيه خطوات ناجحة. راجع الاستكمال من سجل التشغيل أو وافق صراحة على بدء الأتمتة كلها من جديد.",
  WORKFLOW_RECOVERY_UNAVAILABLE:
    "لا يمكن استكمال هذا التشغيل بحالته الحالية. حدّث السجل وراجع الأتمتة.",
  WORKFLOW_RECOVERY_SOURCE_CHANGED:
    "تغيّر تعريف الخطوات أو مصادرها أو صلاحياتها. لم يُعاد استخدام دليل قديم؛ راجع الأتمتة ثم أعد المعاينة.",
  WORKFLOW_RECOVERY_RECEIPT_MISSING:
    "إيصال خطوة سابقة مفقود أو لم يعد متحققاً. لا يمكن تجاوزها اعتماداً على علامة النجاح وحدها.",
  WORKFLOW_RECOVERY_RECEIPT_CHANGED:
    "تغيّر محتوى إيصال التنفيذ السابق. أُوقف الاستكمال قبل تكرار أي أثر.",
  WORKFLOW_RECOVERY_LEGACY:
    "هذا تشغيل قديم بلا بصمات تربط خطواته بمصادرها. راجع آثاره قبل إنشاء تشغيل جديد؛ لا يُتجاوز تلقائياً.",
  WORKFLOW_RECOVERY_LIMIT:
    "وصل هذا التشغيل إلى ثلاث محاولات استكمال مراجعة. راجع النتائج وأنشئ قاعدة للخطوات الباقية عند الحاجة.",
  WORKFLOW_RECOVERY_PREVIEW_EXPIRED:
    "انتهت معاينة الاستكمال أو استُخدمت. أعد المعاينة للحصول على موافقة جديدة.",
  WORKFLOW_RECOVERY_ACK_REQUIRED:
    "راجع احتمال تنفيذ الخطوة غير المؤكدة سابقاً ووافق على إعادة محاولتها قبل المتابعة.",
  RETRY_SUPERSEDED:
    "بدأت فحصاً يدوياً جديداً، فأُلغيت إعادة المحاولة القديمة لمنع قراءة إضافية غير لازمة.",
  RUN_QUEUE_FULL:
    "قائمة الانتظار ممتلئة. راجع المحاولات المعلقة أو ألغِ ما لا تحتاجه قبل تشغيل محاولة جديدة.",
  RETRY_POLICY_UNSUPPORTED:
    "إعادة المحاولة التلقائية متاحة لفحوص الاتصال المصرح بها فقط، بحد أقصى ثلاث محاولات وفاصل من 15 إلى 300 ثانية.",
  RETRY_SCOPE_CHANGED:
    "تغيّر تعريف الفحص أو ربط المشروع أو التفويض؛ أُلغيت إعادة المحاولة. راجع القاعدة قبل تشغيلها مجدداً.",
  RETRY_RESTART_REVIEW:
    "توقفت إعادة محاولة معلقة عند إغلاق البرنامج. راجع الفحص قبل إنشاء محاولة جديدة؛ لا تُعاد تلقائياً بعد التشغيل.",
  MANAGED_WORKSPACE_RELINK_REQUIRED:
    "استخدم معاينة ربط مساحة الملفات من قسم الملفات؛ الربط يتطلب وجود Files وProjects.",
  CATALOG_STALE:
    "تغيّر المصدر أو الفهرس منذ عرض النتيجة. أعد البحث ثم افتح الملف من نتيجته الحالية.",
  FILE_NOT_FOUND:
    "الملف لم يعد موجوداً في هذا المسار. حدّث الفهرس ثم اختر ملفاً متاحاً.",
  CATALOG_SCOPE_INVALID: "اختر بين مصدر واحد وعشرة مصادر مختلفة لتحديث الفهرس.",
  DASHBOARD_TARGET_MISSING:
    "هذا العنصر غير موجود أو المشروع مؤرشف؛ اختر عنصراً متاحاً.",
  DASHBOARD_PIN_LIMIT:
    "الحد الأقصى 20 عنصراً مثبتاً؛ أزل عنصراً قبل إضافة آخر.",
  CONDITION_INVALID:
    "صيغة الشرط أو حدوده غير صالحة؛ لا تُنفّذ تعبيرات أو أوامر عامة.",
  CONDITION_PROJECT_UNAVAILABLE:
    "مشروع الشرط غير مرتبط أو مؤرشف؛ لا يمكن اعتبار الشرط متحققاً.",
  CONDITION_DRIVE_UNLINKED: "حساب Drive غير مرتبط؛ عمر النسخة غير معروف.",
  CONDITION_NO_VERIFIED_BACKUP:
    "لا توجد نسخة متحقق منها مسجلة لهذا النطاق والحساب؛ شرط غياب نسخة حديثة متحقق محلياً.",
  CONDITION_NOT_MET:
    "تُخطيت القاعدة لأن الشرط لم يعد متحققاً؛ لم يُنفذ الإجراء.",
  CONDITION_UNAVAILABLE: "تعذر تقييم الشرط من مصدره المحلي؛ لم يُنفذ الإجراء.",
  CONDITION_CHANGED:
    "تغيرت القاعدة بعد وضعها في الانتظار؛ لم يُنفذ الإجراء القديم.",
  BACKUP_DISCARD_DENIED:
    "إلغاء التجهيز متاح للمحاولات غير المكتملة فقط، ولا يحذف نسخة متحققاً منها.",
  BACKUP_DISCARD_STALE:
    "تغيّر سجل التجهيز أو ملفه أو حساب Drive، أو انتهت المعاينة. أعد المعاينة قبل الإلغاء.",
  DEPLOYMENT_NOT_CONNECTED: "أضف رمز خدمة النشر المطلوبة من الإعدادات أولاً.",
  DEPLOYMENT_LINK_INVALID:
    "راجع معرّفات ربط خدمة النشر وبيئتها؛ لا تقبل حقول المعرّفات روابط مواقع.",
  DEPLOYMENT_SCOPE_MISMATCH:
    "الرمز أو الرد لا يطابق المشروع والبيئة المحددين. أوقف الفحص ولم يُعتمد النطاق المختلف.",
  DEPLOYMENT_AUTH_INVALID: "رمز خدمة النشر غير صالح؛ حدّثه من الإعدادات.",
  DEPLOYMENT_PERMISSION_DENIED: "الرمز لا يملك صلاحية قراءة الخدمة المحددة.",
  DEPLOYMENT_NOT_FOUND: "لا توجد عملية نشر متاحة في النطاق المحدد.",
  DEPLOYMENT_RATE_LIMIT: "بلغت الخدمة حد طلبات الفحص؛ حاول لاحقاً.",
  DEPLOYMENT_NETWORK:
    "تعذر الاتصال بخدمة النشر. الفحوص السابقة تبقى قراءات تاريخية.",
  DEPLOYMENT_QUERY_FAILED:
    "رفض Railway استعلام القراءة. راجع Project Token وصلاحية البيئة.",
  DEPLOYMENT_REQUEST_FAILED:
    "لم تقبل خدمة النشر طلب الفحص؛ لم يُعتمد دليل جديد.",
  DEPLOYMENT_RESPONSE_INVALID:
    "رد خدمة النشر غير مكتمل أو تجاوز حدود القراءة؛ لم تُعتبر النتيجة دليلاً.",
  DEPLOYMENT_FAILED: "سجلت خدمة النشر فشلاً أو إلغاءً أو إزالة لهذه النسخة.",
  DEPLOYMENT_NOT_READY: "النشر لم يصبح جاهزاً أو حالته غير معروفة.",
  DEPLOYMENT_COMMIT_MISMATCH: "Commit النشر لا يطابق Commit المطلوب للمهمة.",
  DEPLOYMENT_COMMIT_UNAVAILABLE:
    "تتوفر حالة النشر، لكن المصدر لا يثبت Commit المطلوب. تبقى مطابقة النسخة غير متحققة.",
  REPORT_RANGE_INVALID: "اختر فترة تقرير من يوم إلى 365 يوماً.",
  GAME_NAME_INVALID:
    "اكتب اسم ملف تشغيل ينتهي بـ .exe فقط، دون مسار أو أمر إضافي.",
  GAME_LIST_INVALID: "يمكن إضافة حتى 30 لعبة فقط.",
  CRITERION_NOT_FOUND:
    "هذا المعيار لم يعد موجوداً في المهمة. حدّث المهمة ثم راجع معاييرها.",
  EVIDENCE_TASK_CHANGED:
    "تغيّرت المهمة أو ربط المشروع أثناء فحص الأدلة. لم تُسجل نتيجة قديمة؛ أعد الفحص.",
  OWNER_REVIEW_REQUIRED:
    "المعيار يحتاج مراجعتك الصريحة؛ لا يستطيع AI اعتماد مراجعته بدلاً عنك.",
  DEPLOYMENT_NOT_CONFIGURED: "لم يُربط مصدر نشر قابل للتحقق لهذا المشروع بعد.",
  CI_NOT_FOUND: "لم توجد عملية CI مطابقة لهذا Commit واسم Workflow المحدد.",
  CI_RESULTS_INCOMPLETE:
    "نتائج CI أكثر من حد القراءة. لم تُعتبر العينة دليلاً كاملاً على النجاح.",
  CI_FAILED: "سُجل فشل أو إلغاء في آخر تشغيل للاختبار المحدد.",
  CI_NOT_SUCCESSFUL: "تشغيل CI غير مكتمل أو لا يحتوي نتيجة نجاح مؤكدة.",
  EVIDENCE_PROVENANCE_REQUIRED:
    "الدليل لا يحتوي مرجعاً ووقت قراءة يمكن التحقق منهما.",
  CLONE_APPROVAL_STALE:
    "انتهت المعاينة أو تغيّر مسار مساحة العمل أو رمز GitHub. أعد المعاينة قبل الاستنساخ.",
  CLONE_REPOSITORY_LIMIT:
    "حجم المستودع غير معروف أو يتجاوز حد الاستنساخ الحالي 100 MiB. يمكنك استنساخه خارج التطبيق ثم استيراد مساره.",
  CLONE_REMOTE_CHANGED:
    "تغيّر Commit الفرع بعد المعاينة. أُلغيت النسخة الجديدة؛ أعد المعاينة للاستنساخ من المرجع الحالي.",
  CLONE_TIMEOUT:
    "تجاوز الاستنساخ الوقت المسموح. أُوقفت عملية Git؛ أعد المحاولة بعد فحص الاتصال.",
  CLONE_CLEANUP_REQUIRED:
    "توقف الاستنساخ وتعذر تنظيف مجلده الجديد بأمان. راجع المسار الذي ظهر في المعاينة قبل إعادة المحاولة.",
  GIT_CLONE_FAILED:
    "لم يكتمل استنساخ GitHub. راجع صلاحية الرمز والاتصال والفرع؛ لم تُستبدل ملفات مشاريعك.",
  TOOL_FORBIDDEN:
    "سياسة أدوات المساعد تمنع هذه العملية. لم تُنفذ؛ راجع إعدادات السياسات إذا أردت تغييرها.",
  TOOL_READ_ONLY:
    "هذه الأداة مقيدة بالقراءة فقط؛ لا تستطيع تنفيذ كتابة بهذه السياسة.",
  TOOL_POLICY_LOCKED:
    "تشغيل الأوامر العامة وتعديل كود المشاريع ممنوعان في هذا الإصدار.",
  TOOL_AUTO_NOT_ALLOWED:
    "هذه العملية تحتاج مراجعة وموافقة؛ التنفيذ التلقائي غير مسموح لها.",
  MANAGED_WORKSPACE_REQUIRED:
    "أنشئ مساحة عمل منظّمة من قسم الملفات أولاً لاختيار مجلد Projects مسموح.",
  GITHUB_LINK_REQUIRED: "حدد مالك المستودع واسمه في بيانات المشروع أولاً.",
  GITHUB_AUTH_INVALID:
    "رمز GitHub غير صالح. حدّثه من الإعدادات؛ لم تُستخدم هوية أخرى تلقائياً.",
  GITHUB_NOT_FOUND_OR_DENIED:
    "المستودع أو الفرع غير موجود، أو لا يملك الرمز صلاحية قراءته.",
  GITHUB_RATE_OR_PERMISSION:
    "GitHub رفض الطلب بسبب الصلاحيات أو حد الطلبات. راجع الرمز أو حاول لاحقاً.",
  GITHUB_NETWORK:
    "تعذر الاتصال بـGitHub. تبقى القراءات السابقة مؤرخة بوقت فحصها.",
  GITHUB_RESPONSE_INVALID:
    "رد GitHub غير مكتمل أو تجاوز حدود القراءة. لم يُعتبر الفحص ناجحاً.",
  BACKUP_SELECTION_DENIED:
    "المجلد المختار للنسخ غير مرتبط أو لم يُسمح بنسخه. راجع المسار والصلاحيات.",
  BACKUP_SCOPE_CHANGED:
    "تغيّر نطاق ملفات النسخة المتوقفة أو صلاحياتها. أوقفت الاستئناف لحماية اختيارك.",
  RETENTION_STATE_CHANGED:
    "تغيّرت النسخ أو الحماية أو سياسة الاحتفاظ. أعد المعاينة قبل التنظيف.",
  RETENTION_PREVIEW_EXPIRED:
    "انتهت صلاحية المعاينة. أعد المعاينة ثم وافق مجدداً.",
  BACKUP_REMOTE_CHANGED:
    "تغيّرت نسخة على Google Drive. أوقف التنظيف؛ راجع النسخ قبل المحاولة مجدداً.",
  RETENTION_RECEIPT_REQUIRED:
    "تعذر تأكيد النتيجة من Google Drive. راجع السلة قبل المحاولة مجدداً.",
  RETENTION_BATCH_TOO_LARGE:
    "عدد النسخ المؤهلة يتجاوز حد التنظيف الآمن (100). عدّل عدد النسخ المحتفظ بها لتقليل الدفعة.",
  MANAGED_FILES_REQUIRED:
    "تنظيم الملفات متاح داخل Files في مساحة العمل المنظّمة فقط. كود المشاريع للقراءة.",
  WORKSPACE_OVERLAP:
    "يتداخل المسار مع مساحة مرتبطة. اختر مجلداً منفصلاً لحماية كود المشاريع من التعديل.",
  DESTINATION_EXISTS:
    "يوجد ملف أو مجلد بهذا الاسم؛ اختر مساراً جديداً. لم يُستبدل شيء.",
  CHATGPT_REMOTE_DISCONNECT_UNCONFIRMED:
    "أُزيلت الاعتماديات محلياً، لكن تعذر تأكيد الفصل عن بُعد. افتح Manage usage وافصل Badawi OS من إعدادات ChatGPT.",
  CHATGPT_USAGE_LIMIT:
    "بلغت حد استخدام اشتراك ChatGPT. افتح Manage usage أو اختر مزوّداً آخر يدوياً؛ لن نفعّل فوترة API تلقائياً.",
  CHATGPT_CANCELLED: "أُلغي تسجيل الدخول أو الطلب. يمكنك المحاولة مجدداً.",
  CHATGPT_SHARING_NOT_ENABLED:
    "الهوية متصلة، لكن إذن استخدام اشتراك ChatGPT غير مفعّل. اختر تفعيل إذن الاشتراك.",
  CHATGPT_RECONNECT_REQUIRED:
    "جلسة ChatGPT تحتاج تسجيل الدخول مجدداً. افتح الإعدادات لإعادة الربط.",
  CHATGPT_NOT_ELIGIBLE:
    "هذا الحساب أو مساحة العمل غير مؤهل لاستخدام الاشتراك هنا وفق OpenAI.",
  CHATGPT_REQUEST_FAILED:
    "لم يكتمل طلب ChatGPT. تحقق من الاتصال وصلاحيات الحساب ثم أعد المحاولة.",
  CHATGPT_STORAGE_ERROR:
    "تعذر قراءة تخزين ChatGPT المحمي على الجهاز. أُبقي الملف الحالي محفوظاً.",
  CHATGPT_UNSUPPORTED_CAPABILITY:
    "هذه الإمكانية غير متاحة لاستخدام اشتراك ChatGPT حالياً.",
  FIXED_DEADLINE_CONFIRMATION_REQUIRED:
    "الموعد ثابت. راجع تغييره ووافق عليه صراحة قبل الحفظ.",
  RECURRENCE_DATE_REQUIRED:
    "حدد موعد تسليم ومنطقة زمنية صحيحة للمهمة المتكررة.",
  TASK_NOT_FOUND: "لم تعد هذه المهمة موجودة. حدّث القائمة.",
  PLAN_NOT_PENDING:
    "هذه الخطة نُفّذت أو رُفضت أو تحتاج مراجعة؛ لن تُعاد تلقائياً.",
  ASSISTANT_ACTION_DENIED:
    "اقترح النموذج إجراء غير مدعوم. لم يُنفّذ شيء؛ اطلب منه استخدام أدوات Badawi المعروفة.",
  AI_SOURCE_APPROVAL_REQUIRED:
    "أرفق المشروع أو الملاحظة، أو فعّل صلاحية قراءة AI للمشروع من قسم الملفات.",
  INVALID_ASSISTANT_RESPONSE:
    "لم يصل رد مطابق لأدوات البرنامج؛ لم تُنفّذ أي إجراءات. حاول مجدداً.",
  WORKFLOW_STEPS_REQUIRED: "أضف خطوة واحدة على الأقل إلى الأتمتة.",
  PROJECT_ARCHIVE_LIMIT:
    "ملفات المشاريع المختارة تتجاوز حد 40 MiB أو 5000 ملف. اختر مجلداً أصغر للنسخة.",
  PROJECT_ARCHIVE_INCOMPLETE:
    "تجاوز المشروع حد الفحص. لم تُرفع نسخة جزئية؛ اختر مجلداً أصغر.",
  PROJECT_ARCHIVE_INVALID:
    "أرشيف المشروع غير سليم؛ أوقفت الاستعادة قبل كتابة الملفات.",
  UPDATE_NOT_NEWER: "اختر مجلد نسخة أحدث من Badawi OS بعد فك ZIP.",
  UPDATE_PACKAGE_INVALID: "المجلد المختار ليس حزمة Badawi OS صحيحة.",

  catchupApproval: "موعد فائت يحتاج موافقتك قبل التنفيذ.",
  restartReview: "موعد من الجلسة السابقة يحتاج مراجعة.",
  interrupted: "انقطع التنفيذ؛ راجع نتيجته قبل المحاولة من جديد.",
  automationDisabled: "أُلغي الموعد بعد تعطيل الأتمتة.",
  supersededByLatest: "استُبدل هذا الموعد بآخر موعد يحتاج مراجعتك.",
  userControl: "توقفت العملية بأمرك.",
  user: "أُلغي بأمرك.",
  WAITING_APPROVAL: "تغيّر المصدر أو التفويض. راجع الأتمتة ووافق عليها مجدداً.",
  WAITING_NETWORK:
    "الاتصال غير متاح أو انتهت مهلة الشبكة. احتُفظ بالتقدم؛ أعد المحاولة عند عودة الاتصال.",
  INVALID_DESKTOP_CLIENT:
    "هذا ليس ملف OAuth من نوع Desktop app. نزّل ملف JSON الصحيح من Google Cloud.",
  BUDGET_CONFIG_REQUIRED:
    "حدد سقف الإنفاق اليومي وأسعار نموذجك من إعدادات الخدمة قبل تفويض AI المجدول.",
  DAILY_SPEND_LIMIT:
    "بلغت سقف الإنفاق المحلي. المحاولات غير المؤكدة تبقى محجوزة حتى لا نكرر الإنفاق تلقائياً.",
  BACKGROUND_INTEGRATION_APPROVAL_REQUIRED:
    "راجع ربط المشروع والحساب ووافق على الفحص المتكرر قبل التفعيل.",
  INTEGRATION_LINK_REQUIRED:
    "اربط المشروع بخدمة الفحص أولاً من بيانات المشروع.",
  INTEGRATION_NOT_CONFIGURED: "أضف رمز الخدمة من الإعدادات أولاً.",
  BACKGROUND_APPROVAL_REQUIRED:
    "راجع النصوص المختارة ووافق على إرسالها قبل تفعيل التلخيص التلقائي.",
  INVALID_AUTOMATION_DRAFT:
    "اقتراح النموذج لا يطابق أنواع الأتمتة المدعومة. اطلب روتيناً أبسط ثم حاول مجدداً.",
  DRAFT_SOURCE_DENIED:
    "الاقتراح يحتاج مصدراً لم تختره. أرفق الملاحظة أو ملخص المشروع في المحادثة أولاً.",
  AI_HTTP_503:
    "الخدمة مزدحمة حالياً. انتظر قليلاً ثم أعد المحاولة؛ لم يصل رد ناجح.",
  AI_NETWORK_OR_TIMEOUT_USAGE_UNKNOWN:
    "انقطع الاتصال أو انتهت مهلة الرد. لم نكرر الطلب تلقائياً؛ قد يكون المزوّد احتسبه.",
  AI_INCOMPLETE:
    "لم يكتمل رد النموذج. جرّب رفع حد الإخراج من الإعدادات ثم أعد المحاولة.",
  CHAT_CONTEXT_LIMIT:
    "وصلت المحادثة إلى حد السياق المحلي. ابدأ محادثة جديدة لمتابعة العمل.",
  CHAT_MODEL_CHANGED:
    "تغيّر النموذج لهذه الخدمة. ابدأ محادثة جديدة لحماية توافق السياق.",
  CHAT_RETRY_REQUIRED: "آخر رد لم يكتمل. أعد محاولته أو ابدأ محادثة جديدة.",
  ATTACHMENT_CHANGED:
    "تغيّر محتوى المرفق. ابدأ محادثة جديدة وأرفق النسخة الحالية.",
  AI_CANCELLED_USAGE_UNKNOWN:
    "أُلغي الانتظار محلياً. قد يبقى استهلاك لدى المزوّد، والطلب محسوب ضمن حد اليوم.",
  OPERATION_UNCERTAIN:
    "هذه العملية كانت جارية عند انقطاع سابق. راجع نتيجتها قبل إنشاء محاولة جديدة.",
  SCHEDULE_NO_FUTURE: "اختر موعداً قادماً لتفعيل الجدولة.",
  PERMISSION_REVOKED: "أُلغيت صلاحية هذا المشروع أثناء القراءة.",
  ENGINE_STOPPED_OR_PAUSED: "شغّل المحرك أولاً لتنفيذ هذه العملية.",
  GAMING_ACTIVE: "وضع اللعب يؤجل هذه العملية. عطّله عندما تكون مستعداً.",
  ENGINE_BUSY: "توجد عملية جارية. انتظر اكتمالها أو أوقف المحرك بأمان.",
  STALE_STATE: "تغيّرت حالة المحرك. حاول مرة أخرى.",
  PATH_DENIED: "هذا المسار غير مسموح. الملفات السرية والروابط مستثناة.",
  PROVIDER_NOT_CONFIGURED: "أضف مفتاح الخدمة واسم النموذج من الإعدادات.",
  AUDIT_INTEGRITY: "سجل التحقق غير سليم. تم منع العمليات الخارجية.",
  AUTH_INVALID: "مفتاح الخدمة غير صالح أو لا يملك صلاحية.",
  RATE_LIMITED: "وصلت الخدمة إلى حد الطلبات. حاول لاحقاً.",
  APPROVAL_STALE: "انتهت صلاحية المعاينة أو تغيّرت الحالة. أعد المعاينة.",
  DAILY_REQUEST_LIMIT: "وصلت إلى حد طلبات اليوم الذي حددته.",
  DRIVE_NOT_CONNECTED: "اربط حساب Google Drive أولاً.",
  RECOVERY_KEY_REQUIRED: "احفظ مفتاح الاسترداد أولاً.",
  DRIVE_AND_RECOVERY_REQUIRED:
    "اربط Drive واحفظ مفتاح الاسترداد قبل تفعيل النسخ.",
  DRIVE_CONFIG_REQUIRED: "أضف إعدادات Google Desktop OAuth أولاً.",
  GIT_NOT_INSTALLED: "Git غير مثبت في مساره المعتاد.",
  GIT_SIMPLE_REPOSITORY_REQUIRED: "هذا المجلد ليس مستودع Git مستقلاً مدعوماً.",
  PROJECT_ALREADY_ADDED: "هذا المشروع مضاف بالفعل.",
  BACKUP_INTEGRITY: "تعذر التحقق من النسخة. راجع مفتاح الاسترداد وسلامة الملف.",
  OPERATION_FAILED:
    "تعذّر تنفيذ العملية. تحقق من المجلد أو إعدادات الاتصال ثم حاول مجدداً.",
  OS_ENCRYPTION_UNAVAILABLE: "تعذر الوصول إلى حماية الأسرار في Windows.",
  DISCONNECT_DRIVE_FIRST: "افصل حساب Drive قبل تغيير إعداداته.",
  AI_INPUT_TOO_LARGE: "النص المحدد طويل. اختر جزءاً أصغر.",
});
export const errorText = (code: string) =>
  messages[code] || uiFormat("تعذر الإكمال ({0}).", [code]);
type Context = {
  data: AppSnapshot;
  send: (c: Command) => Promise<any>;
  act: (c: Command, success?: string) => Promise<any>;
  toast: (message: string) => void;
  page: string;
  go: (page: string) => void;
};
const ctx = createContext<Context | null>(null);
export const useApp = () => useContext(ctx)!;
export function Provider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppSnapshot | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [page, setPage] = useState("dashboard");
  useEffect(() => window.badawi?.onNavigate?.(setPage), []);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const result = await window.badawi.command({ op: "snapshot" });
    if (version !== refreshVersion.current) return;
    if (result.ok) {
      await prepareLanguage(result.data.language);
      if (version !== refreshVersion.current) return;
      setUiLanguage(result.data.language);
      document.documentElement.lang = result.data.language;
      document.documentElement.dir =
        result.data.language === "en" ? "ltr" : "rtl";
      setData(result.data);
      document.documentElement.dataset.theme = result.data.theme;
    } else setError(result.error);
  }, []);
  useEffect(() => {
    if (!window.badawi) {
      setError(
        uiText("افتح Badawi OS من ملف البرنامج لتعمل مساحة العمل المحلية."),
      );
      return;
    }
    void refresh();
    return window.badawi.subscribe(() => void refresh());
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  const send = async (c: Command) => {
    const r = await window.badawi.command(c);
    if (!r.ok) {
      setMessage(
        messages[r.error] || uiFormat("تعذر الإكمال ({0}).", [r.error]),
      );
      throw Error(r.error);
    }
    await refresh();
    if (c.op === "chat.create" && r.data?.id)
      sessionStorage.setItem("badawi.chat.active", r.data.id);
    return r.data;
  };
  const act = async (c: Command, success?: string) => {
    try {
      const result = await send(c);
      if (success && result !== null && result !== false) setMessage(success);
      return result;
    } catch {
      return null;
    }
  };
  if (error)
    return (
      <div className="launch-error">
        <h1>Badawi OS</h1>
        <p>{error}</p>
        <button className="button secondary" onClick={() => location.reload()}>
          {uiText("إعادة المحاولة")}
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="launch-error">
        <div className="brand-name">badawi os</div>
        <p>{uiText("نفتح مساحتك…")}</p>
      </div>
    );
  return (
    <ctx.Provider
      value={{ data, send, act, toast: setMessage, page, go: setPage }}
    >
      {children}
      {message && (
        <div className="toast live-toast" role="status">
          {message}
          <button
            aria-label={uiText("إغلاق التنبيه")}
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
    </ctx.Provider>
  );
}
