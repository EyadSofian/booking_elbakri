import type { Locale } from '@/i18n/config';

/**
 * The contextual help registry.
 *
 * Help text lives here rather than inline in pages so the same concept is
 * explained the same way everywhere it appears, and so Arabic and English stay
 * in step. A screen or field references a `helpKey`; it never carries its own
 * paragraph.
 */

export interface HelpEntry {
  /** Short explanation for a field tooltip. One or two sentences. */
  short: Record<Locale, string>;
}

export interface GuideSection {
  heading: Record<Locale, string>;
  body: Record<Locale, string[]>;
}

export interface PageGuide {
  title: Record<Locale, string>;
  /** One line answering "what is this screen for?". */
  summary: Record<Locale, string>;
  sections: GuideSection[];
}

// ---------------------------------------------------------------------------
// Level A — field help
// ---------------------------------------------------------------------------

export const HELP: Record<string, HelpEntry> = {
  'field.legacyRest': {
    short: {
      en: 'The exact text from the REST column of the original Excel file. Its business meaning was never defined, so the system applies no interpretation to it — the value is preserved for review.',
      ar: 'النص كما ورد في عمود REST في ملف الإكسل الأصلي. معناه في العمل لم يُحدَّد، لذلك لا يطبّق النظام أي تفسير عليه — القيمة محفوظة للمراجعة.',
    },
  },
  'field.canonicalName': {
    short: {
      en: 'The one official spelling the system uses for this record. Every alias resolves to it, so reports group correctly no matter how the name was typed.',
      ar: 'التهجئة الرسمية الوحيدة التي يستخدمها النظام لهذا السجل. كل المسميات البديلة تُحَل إليها، فتتجمّع التقارير بشكل صحيح مهما اختلفت طريقة الكتابة.',
    },
  },
  'field.alias': {
    short: {
      en: 'An alternative spelling that resolves to this record. Approving one teaches every future import how that spelling should be read.',
      ar: 'تهجئة بديلة تُحَل إلى هذا السجل. اعتمادها يعلّم كل عمليات الاستيراد القادمة كيف تُقرأ هذه التهجئة.',
    },
  },
  'field.outstanding': {
    short: {
      en: 'Calculated as the total minus every posted payment. It cannot be typed in — that is what stops the balance disagreeing with the transactions beneath it.',
      ar: 'يُحسب بطرح كل الدفعات المسجّلة من الإجمالي. لا يمكن إدخاله يدويًا — وهذا ما يمنع اختلاف الرصيد عن الحركات التي تحته.',
    },
  },
  'field.securityApproval': {
    short: {
      en: 'This booking needs security clearance before the guest arrives. Carried over from a note in the original workbook.',
      ar: 'هذا الحجز يحتاج موافقة أمنية قبل وصول النزيل. منقولة من ملاحظة في الملف الأصلي.',
    },
  },
  'field.matchConfidence': {
    short: {
      en: 'How strongly the value resembles the suggested record. A score never links anything on its own — only an exact name plus an identical phone links automatically.',
      ar: 'مدى تشابه القيمة مع السجل المقترح. الدرجة وحدها لا تربط أي شيء — الربط التلقائي يحدث فقط عند تطابق الاسم ورقم الهاتف معًا.',
    },
  },
  'field.rawValue': {
    short: {
      en: 'The original cell content from the workbook, kept exactly as it was written. It is never rewritten, even when it cannot be read.',
      ar: 'محتوى الخلية الأصلي من الملف، محفوظ كما كُتب تمامًا. لا يُعاد كتابته أبدًا، حتى لو تعذّرت قراءته.',
    },
  },
  'field.derivedTravelDates': {
    short: {
      en: 'Taken from the earliest and latest date across this file’s services. Setting a date by hand stops the derivation for this trip.',
      ar: 'مأخوذة من أبكر وأحدث تاريخ بين خدمات هذا الملف. تحديد التاريخ يدويًا يوقف الاستنتاج لهذه الرحلة.',
    },
  },
  'field.syncStatus': {
    short: {
      en: 'Whether this hotel is linked to the ELBAKRI Rate Hub directory, waiting for someone to confirm a match, or maintained only here.',
      ar: 'هل هذا الفندق مرتبط بدليل مركز الأسعار، أم بانتظار تأكيد المطابقة، أم مُدار هنا فقط.',
    },
  },
  'field.externalId': {
    short: {
      en: 'The hotel’s identifier in the Rate Hub. Matching on the identifier rather than the name means an upstream rename does not create a duplicate here.',
      ar: 'معرّف الفندق في مركز الأسعار. المطابقة بالمعرّف بدل الاسم تعني أن تغيير الاسم في المصدر لا ينشئ نسخة مكررة هنا.',
    },
  },
  'field.nights': {
    short: {
      en: 'Calculated from check-in and check-out on the server. A stay whose dates could not be read shows no night count rather than a guess.',
      ar: 'تُحسب من تاريخي الوصول والمغادرة على الخادم. الإقامة التي تعذّرت قراءة تواريخها لا تُظهر عدد ليالٍ بدلاً من التخمين.',
    },
  },
  'field.visaMargin': {
    short: {
      en: 'Sell minus net, computed on every read. It is never stored, so it cannot drift from the two amounts it comes from.',
      ar: 'البيع ناقص الصافي، يُحسب عند كل قراءة. لا يُخزَّن أبدًا، فلا يمكن أن يختلف عن المبلغين اللذين يأتي منهما.',
    },
  },
  'field.pickupTime': {
    short: {
      en: 'Times that could not be read from the workbook show the original text in amber. A coordinator must confirm the real pickup before the day of travel.',
      ar: 'الأوقات التي تعذّرت قراءتها من الملف تظهر بنصها الأصلي باللون الكهرماني. على المنسّق تأكيد موعد الاستقبال الفعلي قبل يوم السفر.',
    },
  },
};

// ---------------------------------------------------------------------------
// Level B — page guides
// ---------------------------------------------------------------------------

export const GUIDES: Record<string, PageGuide> = {
  'page.trips': {
    title: { en: 'Trip Files', ar: 'ملفات الرحلات' },
    summary: {
      en: 'One file gathers everything a traveller booked — hotels, transfers, excursions, visas and money — so nobody has to check four systems.',
      ar: 'ملف واحد يجمع كل ما حجزه المسافر — الفنادق والتنقلات والرحلات والتأشيرات والحسابات — حتى لا يضطر أحد لمراجعة أربعة أنظمة.',
    },
    sections: [
      {
        heading: { en: 'When to use it', ar: 'متى تستخدمها' },
        body: {
          en: [
            'To answer "what did this customer book?" in one place.',
            'To add a service to an existing customer instead of re-entering them.',
          ],
          ar: [
            'للإجابة على سؤال «ماذا حجز هذا العميل؟» في مكان واحد.',
            'لإضافة خدمة لعميل موجود بدل إدخاله من جديد.',
          ],
        },
      },
      {
        heading: { en: 'Important rules', ar: 'قواعد مهمة' },
        body: {
          en: [
            'Travel dates come from the services below unless someone sets them by hand.',
            'A trip can be Confirmed while a visa on it is still pending — service status is independent.',
            'Cancelling archives the file; it is never deleted.',
          ],
          ar: [
            'تواريخ السفر تأتي من الخدمات أدناه ما لم يحددها أحد يدويًا.',
            'يمكن تأكيد الرحلة بينما تأشيرة عليها ما زالت معلّقة — حالة الخدمة مستقلة.',
            'الإلغاء يؤرشف الملف ولا يحذفه أبدًا.',
          ],
        },
      },
      {
        heading: { en: 'Common mistakes', ar: 'أخطاء شائعة' },
        body: {
          en: [
            'Creating a second file for a customer who already has one — search by phone first.',
            'Expecting a cancelled file to disappear. It stays, so the history stays truthful.',
          ],
          ar: [
            'إنشاء ملف ثانٍ لعميل لديه ملف بالفعل — ابحث برقم الهاتف أولًا.',
            'توقّع اختفاء الملف الملغى. يبقى موجودًا حتى يظل السجل صادقًا.',
          ],
        },
      },
    ],
  },

  'page.operations': {
    title: { en: "Today's Operations", ar: 'عمليات اليوم' },
    summary: {
      en: 'The day sheet: every arrival, departure, check-in, transfer and excursion for one date, in order of time.',
      ar: 'جدول اليوم: كل وصول ومغادرة ودخول فندق وتنقّل ورحلة في تاريخ واحد، مرتّبة بالوقت.',
    },
    sections: [
      {
        heading: { en: 'Typical workflow', ar: 'سير العمل المعتاد' },
        body: {
          en: [
            'Open it at the start of the shift on today’s date.',
            'Scan for amber markers — those are the jobs that are not ready.',
            'Assign drivers to anything still unassigned, then work down the timeline.',
          ],
          ar: [
            'افتحها في بداية الوردية على تاريخ اليوم.',
            'ابحث عن العلامات الكهرمانية — هذه هي المهام غير الجاهزة.',
            'أسنِد سائقين لما لم يُسنَد بعد، ثم تابع الجدول الزمني.',
          ],
        },
      },
      {
        heading: { en: 'What the warnings mean', ar: 'معنى التحذيرات' },
        body: {
          en: [
            'An amber pickup time means the workbook value could not be read — confirm it with the agency.',
            'A missing driver means the leg is scheduled but nobody is going.',
          ],
          ar: [
            'وقت استقبال كهرماني يعني أن قيمة الملف تعذّرت قراءتها — أكّدها مع الشركة.',
            'غياب السائق يعني أن المسار مجدول لكن لا أحد ذاهب.',
          ],
        },
      },
    ],
  },

  'page.imports': {
    title: { en: 'Import Center', ar: 'مركز الاستيراد' },
    summary: {
      en: 'Brings an Excel workbook into the system, proving on the way that no meaningful row was lost.',
      ar: 'يستورد ملف إكسل إلى النظام، ويثبت أثناء ذلك أنه لم يُفقد أي صف ذي معنى.',
    },
    sections: [
      {
        heading: { en: 'The workflow', ar: 'سير العمل' },
        body: {
          en: [
            'Upload — the file is stored and read. Nothing is written to the system yet.',
            'File, Mapping and Matching — check the layout was understood and decide what unknown values mean.',
            'Issues and Preview — see the problems and exactly what will be created.',
            'Apply — writes the whole workbook in one transaction.',
          ],
          ar: [
            'الرفع — يُحفظ الملف ويُقرأ. لا يُكتب شيء في النظام بعد.',
            'الملف والربط والمطابقة — تأكّد من فهم التنسيق وحدّد معنى القيم غير المعروفة.',
            'الملاحظات والمعاينة — اطّلع على المشاكل وعلى ما سيُنشأ بالضبط.',
            'التطبيق — يكتب الملف كاملًا في معاملة واحدة.',
          ],
        },
      },
      {
        heading: { en: 'Important rules', ar: 'قواعد مهمة' },
        body: {
          en: [
            'Every scanned row must be accounted for before you apply. The reconciliation proves it.',
            'The same workbook cannot be applied twice — it is matched by checksum, so renaming the file does not help.',
            'A value that could not be read is kept as written and raised as an issue. It is never guessed.',
          ],
          ar: [
            'يجب حساب كل صف تم فحصه قبل التطبيق. المطابقة تثبت ذلك.',
            'لا يمكن تطبيق نفس الملف مرتين — تتم المطابقة ببصمة الملف، فتغيير الاسم لا يفيد.',
            'القيمة التي تعذّرت قراءتها تُحفظ كما كُتبت وتُرفع كملاحظة. لا تُخمَّن أبدًا.',
          ],
        },
      },
    ],
  },

  'page.matching': {
    title: { en: 'Matching', ar: 'المطابقة' },
    summary: {
      en: 'Decides what an unrecognised spelling means. Your decision is remembered, so every future import resolves it automatically.',
      ar: 'يحدّد معنى التهجئة غير المعروفة. قرارك يُحفظ، فتُحَل تلقائيًا في كل استيراد قادم.',
    },
    sections: [
      {
        heading: { en: 'Your three choices', ar: 'خياراتك الثلاثة' },
        body: {
          en: [
            'Match to existing — the value is another spelling of a record you already have.',
            'Create as new — this is genuinely a hotel or agency the system has not seen.',
            'Reject — the value is not an entity at all (a note, a typo, a stray cell).',
          ],
          ar: [
            'المطابقة مع موجود — القيمة تهجئة أخرى لسجل لديك بالفعل.',
            'إنشاء جديد — هذا فعلاً فندق أو شركة لم يرها النظام من قبل.',
            'رفض — القيمة ليست كيانًا أصلاً (ملاحظة أو خطأ كتابة أو خلية شاردة).',
          ],
        },
      },
      {
        heading: { en: 'Example', ar: 'مثال' },
        body: {
          en: [
            '"SAMA TOURS" appearing 19 times is almost certainly the agency already recorded as SAMA. Match it to the existing record; the next import resolves it without asking.',
          ],
          ar: [
            '«SAMA TOURS» التي ظهرت ١٩ مرة هي على الأرجح نفس الشركة المسجّلة باسم SAMA. طابقها مع السجل الموجود؛ والاستيراد التالي سيحلّها دون سؤال.',
          ],
        },
      },
      {
        heading: { en: 'Why it asks instead of guessing', ar: 'لماذا يسأل بدل التخمين' },
        body: {
          en: [
            'A wrong merge silently moves one company’s bookings onto another. A duplicate is visible and reversible. So similarity only ever suggests — it never links.',
          ],
          ar: [
            'الدمج الخاطئ ينقل حجوزات شركة إلى أخرى بصمت. أما التكرار فظاهر ويمكن التراجع عنه. لذلك التشابه يقترح فقط ولا يربط أبدًا.',
          ],
        },
      },
    ],
  },

  'page.finance': {
    title: { en: 'Finance', ar: 'الحسابات' },
    summary: {
      en: 'Payables and the payments against them. Balances are calculated from the transactions, never typed.',
      ar: 'المستحقات والدفعات المقابلة لها. الأرصدة تُحسب من الحركات ولا تُكتب يدويًا.',
    },
    sections: [
      {
        heading: { en: 'Important rules', ar: 'قواعد مهمة' },
        body: {
          en: [
            'You record a payment; the outstanding balance follows from it. There is no field to type a balance into.',
            'Correcting a payment posts a reversal. The original entry stays visible, so the history explains itself.',
          ],
          ar: [
            'أنت تسجّل دفعة، والرصيد المتبقي يتبعها. لا يوجد حقل لكتابة الرصيد.',
            'تصحيح دفعة يسجّل قيدًا عكسيًا. القيد الأصلي يبقى ظاهرًا، فيشرح السجل نفسه.',
          ],
        },
      },
      {
        heading: { en: 'Why the old REST column is not used', ar: 'لماذا لا يُستخدم عمود REST القديم' },
        body: {
          en: [
            'In the original workbook it disagreed with its own arithmetic on 10 of the 38 fully numeric rows — used as a remainder on some and a running total on others. Reconciliation shows both figures side by side without altering either.',
          ],
          ar: [
            'في الملف الأصلي كان يخالف حساباته في ١٠ صفوف من أصل ٣٨ صفًا رقميًا — استُخدم كمتبقٍ في بعضها وكمجموع تراكمي في غيرها. تعرض المطابقة الرقمين جنبًا إلى جنب دون تعديل أي منهما.',
          ],
        },
      },
    ],
  },

  'page.dataQuality': {
    title: { en: 'Data Quality', ar: 'جودة البيانات' },
    summary: {
      en: 'Everything the import could not read or could not be sure about, kept open until a person decides.',
      ar: 'كل ما تعذّر على الاستيراد قراءته أو التأكد منه، يبقى مفتوحًا حتى يقرر شخص.',
    },
    sections: [
      {
        heading: { en: 'How to work through it', ar: 'كيف تعالجها' },
        body: {
          en: [
            'Start with errors — those are values that could not be read at all.',
            'Open the record, check the original value, and correct it there.',
            'Then resolve the issue, or ignore it with a reason.',
          ],
          ar: [
            'ابدأ بالأخطاء — هذه قيم تعذّرت قراءتها تمامًا.',
            'افتح السجل، راجع القيمة الأصلية، وصحّحها هناك.',
            'ثم عالج الملاحظة، أو تجاهلها مع ذكر السبب.',
          ],
        },
      },
      {
        heading: { en: 'Why ignoring needs a reason', ar: 'لماذا يحتاج التجاهل سببًا' },
        body: {
          en: [
            'Closing something without saying why is how a data problem becomes folklore — six months later nobody remembers whether it was checked or just dismissed.',
          ],
          ar: [
            'إغلاق ملاحظة دون ذكر السبب هو ما يحوّل مشكلة البيانات إلى إشاعة — بعد ستة أشهر لن يتذكر أحد هل رُوجعت أم أُهملت.',
          ],
        },
      },
    ],
  },

  'page.hotels': {
    title: { en: 'Hotels', ar: 'الفنادق' },
    summary: {
      en: 'The hotel directory used across bookings, synchronised from the ELBAKRI Rate Hub.',
      ar: 'دليل الفنادق المستخدم في كل الحجوزات، ومتزامن من مركز أسعار البكري.',
    },
    sections: [
      {
        heading: { en: 'Where the details come from', ar: 'من أين تأتي التفاصيل' },
        body: {
          en: [
            'Descriptive details — group, region, stars, facilities, policies — are synchronised from the Rate Hub.',
            'Pricing is deliberately not brought into this system. The two products stay separate.',
          ],
          ar: [
            'التفاصيل الوصفية — المجموعة والمنطقة والنجوم والمرافق والسياسات — متزامنة من مركز الأسعار.',
            'الأسعار لا تُنقل إلى هذا النظام عمدًا. النظامان يبقيان منفصلين.',
          ],
        },
      },
      {
        heading: { en: 'If a hotel needs review', ar: 'إذا كان الفندق يحتاج مراجعة' },
        body: {
          en: [
            'The sync found a likely match but would not link it on its own. Open the hotel and confirm, or keep it separate.',
            'A failed sync never empties the list — the last good catalogue keeps serving.',
          ],
          ar: [
            'وجدت المزامنة تطابقًا محتملاً لكنها لم تربطه من تلقاء نفسها. افتح الفندق وأكّد، أو أبقِه منفصلاً.',
            'فشل المزامنة لا يفرّغ القائمة أبدًا — يستمر عرض آخر دليل ناجح.',
          ],
        },
      },
    ],
  },

  'page.transfers': {
    title: { en: 'Transfers', ar: 'التنقلات' },
    summary: {
      en: 'Every journey leg, with the dispatch actions to assign a driver and move it through the day.',
      ar: 'كل مسار رحلة، مع إجراءات التشغيل لإسناد سائق ومتابعته خلال اليوم.',
    },
    sections: [
      {
        heading: { en: 'The workflow', ar: 'سير العمل' },
        body: {
          en: [
            'Scheduled → Assigned → Dispatched → Picked up → Completed.',
            'A leg cannot go back to draft once dispatched — once something happened on the ground, the record of it stays truthful.',
          ],
          ar: [
            'مجدول ← تم الإسناد ← تم الإرسال ← تم الاستقبال ← مكتمل.',
            'لا يمكن إعادة المسار إلى مسودة بعد إرساله — ما حدث على الأرض يبقى مسجّلاً بصدق.',
          ],
        },
      },
      {
        heading: { en: 'One booking, several legs', ar: 'حجز واحد، عدة مسارات' },
        body: {
          en: [
            'Arrival and return belong to the same booking. That is why the old spreadsheet left the name blank on the return row.',
          ],
          ar: [
            'الوصول والعودة ينتميان لنفس الحجز. لهذا كان الملف القديم يترك خانة الاسم فارغة في صف العودة.',
          ],
        },
      },
    ],
  },

  'page.excursions': {
    title: { en: 'Excursions', ar: 'الرحلات السياحية' },
    summary: {
      en: 'Excursion orders. One customer’s several activities stay together as one order.',
      ar: 'طلبات الرحلات. أنشطة العميل المتعددة تبقى معًا في طلب واحد.',
    },
    sections: [
      {
        heading: { en: 'Important rules', ar: 'قواعد مهمة' },
        body: {
          en: [
            'An order holds many activities. In the old sheet those were the rows with a blank name beneath the customer.',
            'The REST column is kept exactly as written; its meaning was never defined, so nothing is inferred from it.',
          ],
          ar: [
            'الطلب يضم أنشطة متعددة. في الملف القديم كانت هذه هي الصفوف الفارغة الاسم تحت العميل.',
            'عمود REST محفوظ كما كُتب تمامًا؛ معناه لم يُحدَّد، فلا يُستنتج منه شيء.',
          ],
        },
      },
    ],
  },

  'page.visas': {
    title: { en: 'Visas', ar: 'التأشيرات' },
    summary: {
      en: 'Visa orders and their status. Amounts are shown only to users with visa finance access.',
      ar: 'طلبات التأشيرات وحالتها. المبالغ تظهر فقط لمن لديه صلاحية حسابات التأشيرات.',
    },
    sections: [
      {
        heading: { en: 'Important rules', ar: 'قواعد مهمة' },
        body: {
          en: [
            'Margin is sell minus net, calculated on read. It is never stored and cannot be edited.',
            'Without the visa finance permission the amounts are absent from the response, not merely hidden on screen.',
          ],
          ar: [
            'هامش الربح هو البيع ناقص الصافي، ويُحسب عند القراءة. لا يُخزَّن ولا يمكن تعديله.',
            'بدون صلاحية حسابات التأشيرات لا تُرسل المبالغ أصلاً، وليست مجرد مخفية على الشاشة.',
          ],
        },
      },
    ],
  },

  'page.hotelBookings': {
    title: { en: 'Hotel Bookings', ar: 'حجوزات الفنادق' },
    summary: {
      en: 'Hotel stays across every trip file, with the dates and rooms as recorded.',
      ar: 'إقامات الفنادق عبر كل ملفات الرحلات، بالتواريخ والغرف كما سُجّلت.',
    },
    sections: [
      {
        heading: { en: 'Reading the dates', ar: 'قراءة التواريخ' },
        body: {
          en: [
            'A date shown in amber is the original text from the workbook, because it could not be read as a date.',
            'Nights are calculated on the server. A stay with an unreadable date shows no night count rather than a guess.',
          ],
          ar: [
            'التاريخ الظاهر باللون الكهرماني هو النص الأصلي من الملف، لأنه تعذّرت قراءته كتاريخ.',
            'الليالي تُحسب على الخادم. الإقامة بتاريخ غير مقروء لا تُظهر عدد ليالٍ بدل التخمين.',
          ],
        },
      },
    ],
  },

  'page.travelers': {
    title: { en: 'Travellers', ar: 'المسافرون' },
    summary: {
      en: 'Everyone the company has served, and everything each of them booked.',
      ar: 'كل من خدمتهم الشركة، وكل ما حجزه كل واحد منهم.',
    },
    sections: [
      {
        heading: { en: 'Duplicates', ar: 'التكرارات' },
        body: {
          en: [
            'Two records link automatically only when the name matches exactly and the phone is identical.',
            'Anything weaker is offered as a suggestion. Merging moves every service onto the surviving record and is recorded in the audit log.',
          ],
          ar: [
            'يُربط سجلان تلقائيًا فقط عند تطابق الاسم تمامًا وتطابق رقم الهاتف.',
            'ما دون ذلك يُعرض كاقتراح. الدمج ينقل كل الخدمات إلى السجل الباقي ويُسجَّل في سجل التدقيق.',
          ],
        },
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Level C — critical inline notices
// ---------------------------------------------------------------------------

export const NOTICES: Record<string, Record<Locale, string>> = {
  'notice.importReconciliation': {
    en: 'Every meaningful source row must be accounted for before applying.',
    ar: 'يجب حساب كل صف مصدر ذي معنى قبل التطبيق.',
  },
  'notice.matchingTeaches': {
    en: 'Matching teaches future imports how this spelling should resolve.',
    ar: 'المطابقة تعلّم عمليات الاستيراد القادمة كيف تُحَل هذه التهجئة.',
  },
  'notice.outstandingDerived': {
    en: 'Outstanding is calculated from payment transactions and cannot be typed manually.',
    ar: 'المتبقي يُحسب من حركات الدفع ولا يمكن إدخاله يدويًا.',
  },
  'notice.hotelDirectorySource': {
    en: 'Hotel details are synchronized from ELBAKRI Rate Hub. Pricing is intentionally not imported into this system.',
    ar: 'تفاصيل الفنادق متزامنة من مركز أسعار البكري. الأسعار غير مستوردة إلى هذا النظام عمدًا.',
  },
  'notice.legacyValuePreserved': {
    en: 'This is the exact value from the original Excel file and has been preserved for review.',
    ar: 'هذه هي القيمة كما وردت في ملف الإكسل الأصلي وقد حُفظت للمراجعة.',
  },
};

export function helpText(key: string, locale: Locale): string | null {
  return HELP[key]?.short[locale] ?? null;
}

export function noticeText(key: string, locale: Locale): string | null {
  return NOTICES[key]?.[locale] ?? null;
}

export function pageGuide(key: string): PageGuide | null {
  return GUIDES[key] ?? null;
}
