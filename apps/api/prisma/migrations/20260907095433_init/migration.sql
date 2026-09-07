-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "roleIds" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TRAVEL_AGENCY',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_aliases" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "source" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "city" TEXT,
    "area" TEXT,
    "starRating" INTEGER,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_aliases" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "source" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_type_aliases" (
    "id" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_type_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_aliases" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_plan_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "city" TEXT,
    "iataCode" TEXT,
    "hotelId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_aliases" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_catalog_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT,
    "defaultDurationMinutes" INTEGER,
    "transferIncludedByDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excursion_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_aliases" (
    "id" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excursion_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nationalities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nationalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nationality_aliases" (
    "id" TEXT NOT NULL,
    "nationalityId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nationality_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "model" TEXT,
    "capacity" INTEGER,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneNormalized" TEXT,
    "licenseNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias_mappings" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "suggestedId" TEXT,
    "suggestedName" TEXT,
    "score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "resolvedId" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "importRunId" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alias_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travelers" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fullNameAr" TEXT,
    "normalizedName" TEXT NOT NULL,
    "phoneRaw" TEXT,
    "phoneNormalized" TEXT,
    "phoneDigits" TEXT,
    "countryCallingCode" TEXT,
    "email" TEXT,
    "nationalityId" TEXT,
    "nationalityRaw" TEXT,
    "passportNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "partnerId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_files" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "leadTravelerId" TEXT,
    "partnerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "travelStartDate" TIMESTAMP(3),
    "travelEndDate" TIMESTAMP(3),
    "travelDatesOverridden" BOOLEAN NOT NULL DEFAULT false,
    "paxCount" INTEGER,
    "childCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "trip_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_travelers" (
    "id" TEXT NOT NULL,
    "tripFileId" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "isChild" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_transitions" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "tripFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tripFileId" TEXT NOT NULL,
    "leadTravelerId" TEXT,
    "partnerId" TEXT,
    "hotelId" TEXT,
    "hotelRaw" TEXT,
    "bookingDate" TIMESTAMP(3),
    "confirmationNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "securityApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "hotel_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_stay_segments" (
    "id" TEXT NOT NULL,
    "hotelBookingId" TEXT NOT NULL,
    "hotelId" TEXT,
    "hotelRaw" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "nights" INTEGER,
    "mealPlanId" TEXT,
    "mealPlanRaw" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "checkInRaw" TEXT,
    "checkOutRaw" TEXT,
    "checkInParseStatus" TEXT,
    "checkOutParseStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "legacySource" JSONB,

    CONSTRAINT "hotel_stay_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_allocations" (
    "id" TEXT NOT NULL,
    "hotelStaySegmentId" TEXT NOT NULL,
    "roomTypeId" TEXT,
    "roomTypeRaw" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "adults" INTEGER,
    "children" INTEGER,
    "occupantTravelerId" TEXT,
    "roomNumber" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tripFileId" TEXT NOT NULL,
    "leadTravelerId" TEXT,
    "partnerId" TEXT,
    "paxCount" INTEGER,
    "paxCountRaw" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "transfer_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_legs" (
    "id" TEXT NOT NULL,
    "transferBookingId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "direction" TEXT NOT NULL DEFAULT 'OTHER',
    "fromLocationId" TEXT,
    "fromRaw" TEXT,
    "toLocationId" TEXT,
    "toRaw" TEXT,
    "serviceDate" TIMESTAMP(3),
    "serviceDateRaw" TEXT,
    "pickupTimeMinutes" INTEGER,
    "pickupTimeRaw" TEXT,
    "pickupTimeParseStatus" TEXT,
    "flightNumber" TEXT,
    "paxCount" INTEGER,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "supplierPartnerId" TEXT,
    "meetAndGreet" BOOLEAN NOT NULL DEFAULT false,
    "flowerBouquet" BOOLEAN NOT NULL DEFAULT false,
    "securityApprovalRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,

    CONSTRAINT "transfer_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tripFileId" TEXT NOT NULL,
    "leadTravelerId" TEXT,
    "partnerId" TEXT,
    "hotelId" TEXT,
    "hotelRaw" TEXT,
    "paxCount" INTEGER,
    "childCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "legacyRestRaw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "excursion_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excursion_items" (
    "id" TEXT NOT NULL,
    "excursionBookingId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "activityRaw" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "serviceDate" TIMESTAMP(3),
    "serviceDateRaw" TEXT,
    "serviceTimeMinutes" INTEGER,
    "paxOverride" INTEGER,
    "childOverride" INTEGER,
    "transferRequired" BOOLEAN NOT NULL DEFAULT false,
    "guideRequired" BOOLEAN NOT NULL DEFAULT false,
    "addOns" TEXT,
    "supplierPartnerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,

    CONSTRAINT "excursion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "tripFileId" TEXT NOT NULL,
    "leadTravelerId" TEXT,
    "partnerId" TEXT,
    "originRaw" TEXT,
    "destinationRaw" TEXT,
    "paxCount" INTEGER,
    "serviceDate" TIMESTAMP(3),
    "serviceDateRaw" TEXT,
    "netAmount" DECIMAL(14,2),
    "sellAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "visa_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_applicants" (
    "id" TEXT NOT NULL,
    "visaOrderId" TEXT NOT NULL,
    "travelerId" TEXT,
    "fullName" TEXT,
    "passportNumber" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DOCUMENTS_PENDING',
    "documentsComplete" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visa_applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "hotelId" TEXT,
    "partnerId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_documents" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PAYABLE',
    "counterpartyId" TEXT,
    "tripFileId" TEXT,
    "hotelBookingId" TEXT,
    "serviceDescription" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "serviceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacyTotalRaw" TEXT,
    "legacyPaidRaw" TEXT,
    "legacyRestRaw" TEXT,
    "legacyPaymentDateRaw" TEXT,
    "legacyStatusRaw" TEXT,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "financial_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "financialDocumentId" TEXT,
    "counterpartyId" TEXT,
    "settlementId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "paymentReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "reversesPaymentId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "partnerId" TEXT,
    "counterpartyId" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "descriptionAr" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "legacySource" JSONB,
    "importRunId" TEXT,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "analysis" JSONB,
    "reconciliation" JSONB,
    "rowsScanned" INTEGER NOT NULL DEFAULT 0,
    "rowsBlank" INTEGER NOT NULL DEFAULT 0,
    "rowsStructural" INTEGER NOT NULL DEFAULT 0,
    "rowsMaster" INTEGER NOT NULL DEFAULT 0,
    "rowsContinuation" INTEGER NOT NULL DEFAULT 0,
    "rowsOrphan" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsMatched" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sheets" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "detectedKind" TEXT,
    "headerRow" INTEGER,
    "maxRow" INTEGER NOT NULL DEFAULT 0,
    "maxColumn" INTEGER NOT NULL DEFAULT 0,
    "rowsScanned" INTEGER NOT NULL DEFAULT 0,
    "columnMapping" JSONB,
    "unmappedColumns" TEXT[],
    "isEmpty" BOOLEAN NOT NULL DEFAULT false,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "importSheetId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "masterRowNumber" INTEGER,
    "rawValues" JSONB NOT NULL,
    "unmappedValues" JSONB,
    "normalizedValues" JSONB,
    "createdEntityType" TEXT,
    "createdEntityId" TEXT,
    "matchedEntityId" TEXT,
    "sectionLabel" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issues" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "importRowId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "field" TEXT,
    "rawValue" TEXT,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_quality_issues" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "field" TEXT,
    "rawValue" TEXT,
    "message" TEXT NOT NULL,
    "suggestion" TEXT,
    "details" JSONB,
    "fingerprint" TEXT NOT NULL,
    "sourceWorkbook" TEXT,
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "importRunId" TEXT,
    "assignedToId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_quality_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksum" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "tripFileId" TEXT,
    "hotelBookingId" TEXT,
    "transferBookingId" TEXT,
    "excursionBookingId" TEXT,
    "visaOrderId" TEXT,
    "financialDocumentId" TEXT,
    "paymentId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "body" TEXT,
    "bodyAr" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "reference_sequences" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reference_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_normalizedName_idx" ON "users"("normalizedName");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_groupKey_idx" ON "permissions"("groupKey");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_userId_permissionId_key" ON "user_permission_overrides"("userId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_tokens_tokenHash_key" ON "invitation_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "invitation_tokens_email_idx" ON "invitation_tokens"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyPrefix_key" ON "api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "api_keys_revokedAt_idx" ON "api_keys"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "partners_normalizedName_key" ON "partners"("normalizedName");

-- CreateIndex
CREATE INDEX "partners_type_idx" ON "partners"("type");

-- CreateIndex
CREATE INDEX "partners_isActive_idx" ON "partners"("isActive");

-- CreateIndex
CREATE INDEX "partner_aliases_aliasKey_idx" ON "partner_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "partner_aliases_aliasKey_partnerId_key" ON "partner_aliases"("aliasKey", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_normalizedName_key" ON "hotels"("normalizedName");

-- CreateIndex
CREATE INDEX "hotels_city_idx" ON "hotels"("city");

-- CreateIndex
CREATE INDEX "hotels_isActive_idx" ON "hotels"("isActive");

-- CreateIndex
CREATE INDEX "hotel_aliases_aliasKey_idx" ON "hotel_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_aliases_aliasKey_hotelId_key" ON "hotel_aliases"("aliasKey", "hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_code_key" ON "room_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_normalizedName_key" ON "room_types"("normalizedName");

-- CreateIndex
CREATE INDEX "room_type_aliases_aliasKey_idx" ON "room_type_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "room_type_aliases_aliasKey_roomTypeId_key" ON "room_type_aliases"("aliasKey", "roomTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_code_key" ON "meal_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_normalizedName_key" ON "meal_plans"("normalizedName");

-- CreateIndex
CREATE INDEX "meal_plan_aliases_aliasKey_idx" ON "meal_plan_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_aliases_aliasKey_mealPlanId_key" ON "meal_plan_aliases"("aliasKey", "mealPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "locations_normalizedName_key" ON "locations"("normalizedName");

-- CreateIndex
CREATE INDEX "locations_kind_idx" ON "locations"("kind");

-- CreateIndex
CREATE INDEX "location_aliases_aliasKey_idx" ON "location_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "location_aliases_aliasKey_locationId_key" ON "location_aliases"("aliasKey", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "excursion_catalog_items_code_key" ON "excursion_catalog_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "excursion_catalog_items_normalizedName_key" ON "excursion_catalog_items"("normalizedName");

-- CreateIndex
CREATE INDEX "excursion_aliases_aliasKey_idx" ON "excursion_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "excursion_aliases_aliasKey_catalogItemId_key" ON "excursion_aliases"("aliasKey", "catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "nationalities_code_key" ON "nationalities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "nationalities_normalizedName_key" ON "nationalities"("normalizedName");

-- CreateIndex
CREATE INDEX "nationality_aliases_aliasKey_idx" ON "nationality_aliases"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "nationality_aliases_aliasKey_nationalityId_key" ON "nationality_aliases"("aliasKey", "nationalityId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

-- CreateIndex
CREATE INDEX "drivers_normalizedName_idx" ON "drivers"("normalizedName");

-- CreateIndex
CREATE INDEX "alias_mappings_status_idx" ON "alias_mappings"("status");

-- CreateIndex
CREATE INDEX "alias_mappings_entityType_idx" ON "alias_mappings"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "alias_mappings_entityType_aliasKey_key" ON "alias_mappings"("entityType", "aliasKey");

-- CreateIndex
CREATE INDEX "travelers_normalizedName_idx" ON "travelers"("normalizedName");

-- CreateIndex
CREATE INDEX "travelers_phoneNormalized_idx" ON "travelers"("phoneNormalized");

-- CreateIndex
CREATE INDEX "travelers_phoneDigits_idx" ON "travelers"("phoneDigits");

-- CreateIndex
CREATE INDEX "travelers_partnerId_idx" ON "travelers"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_files_reference_key" ON "trip_files"("reference");

-- CreateIndex
CREATE INDEX "trip_files_status_idx" ON "trip_files"("status");

-- CreateIndex
CREATE INDEX "trip_files_travelStartDate_idx" ON "trip_files"("travelStartDate");

-- CreateIndex
CREATE INDEX "trip_files_travelEndDate_idx" ON "trip_files"("travelEndDate");

-- CreateIndex
CREATE INDEX "trip_files_partnerId_idx" ON "trip_files"("partnerId");

-- CreateIndex
CREATE INDEX "trip_files_leadTravelerId_idx" ON "trip_files"("leadTravelerId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_travelers_tripFileId_travelerId_key" ON "trip_travelers"("tripFileId", "travelerId");

-- CreateIndex
CREATE INDEX "status_transitions_entityType_entityId_idx" ON "status_transitions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "status_transitions_createdAt_idx" ON "status_transitions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_bookings_reference_key" ON "hotel_bookings"("reference");

-- CreateIndex
CREATE INDEX "hotel_bookings_tripFileId_idx" ON "hotel_bookings"("tripFileId");

-- CreateIndex
CREATE INDEX "hotel_bookings_status_idx" ON "hotel_bookings"("status");

-- CreateIndex
CREATE INDEX "hotel_bookings_hotelId_idx" ON "hotel_bookings"("hotelId");

-- CreateIndex
CREATE INDEX "hotel_bookings_bookingDate_idx" ON "hotel_bookings"("bookingDate");

-- CreateIndex
CREATE INDEX "hotel_stay_segments_hotelBookingId_idx" ON "hotel_stay_segments"("hotelBookingId");

-- CreateIndex
CREATE INDEX "hotel_stay_segments_checkIn_idx" ON "hotel_stay_segments"("checkIn");

-- CreateIndex
CREATE INDEX "hotel_stay_segments_checkOut_idx" ON "hotel_stay_segments"("checkOut");

-- CreateIndex
CREATE INDEX "room_allocations_hotelStaySegmentId_idx" ON "room_allocations"("hotelStaySegmentId");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_bookings_reference_key" ON "transfer_bookings"("reference");

-- CreateIndex
CREATE INDEX "transfer_bookings_tripFileId_idx" ON "transfer_bookings"("tripFileId");

-- CreateIndex
CREATE INDEX "transfer_bookings_status_idx" ON "transfer_bookings"("status");

-- CreateIndex
CREATE INDEX "transfer_legs_transferBookingId_idx" ON "transfer_legs"("transferBookingId");

-- CreateIndex
CREATE INDEX "transfer_legs_serviceDate_idx" ON "transfer_legs"("serviceDate");

-- CreateIndex
CREATE INDEX "transfer_legs_status_idx" ON "transfer_legs"("status");

-- CreateIndex
CREATE INDEX "transfer_legs_flightNumber_idx" ON "transfer_legs"("flightNumber");

-- CreateIndex
CREATE INDEX "transfer_legs_driverId_idx" ON "transfer_legs"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "excursion_bookings_reference_key" ON "excursion_bookings"("reference");

-- CreateIndex
CREATE INDEX "excursion_bookings_tripFileId_idx" ON "excursion_bookings"("tripFileId");

-- CreateIndex
CREATE INDEX "excursion_bookings_status_idx" ON "excursion_bookings"("status");

-- CreateIndex
CREATE INDEX "excursion_items_excursionBookingId_idx" ON "excursion_items"("excursionBookingId");

-- CreateIndex
CREATE INDEX "excursion_items_serviceDate_idx" ON "excursion_items"("serviceDate");

-- CreateIndex
CREATE INDEX "excursion_items_status_idx" ON "excursion_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "visa_orders_reference_key" ON "visa_orders"("reference");

-- CreateIndex
CREATE INDEX "visa_orders_tripFileId_idx" ON "visa_orders"("tripFileId");

-- CreateIndex
CREATE INDEX "visa_orders_status_idx" ON "visa_orders"("status");

-- CreateIndex
CREATE INDEX "visa_orders_serviceDate_idx" ON "visa_orders"("serviceDate");

-- CreateIndex
CREATE INDEX "visa_applicants_visaOrderId_idx" ON "visa_applicants"("visaOrderId");

-- CreateIndex
CREATE INDEX "counterparties_type_idx" ON "counterparties"("type");

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_normalizedName_type_key" ON "counterparties"("normalizedName", "type");

-- CreateIndex
CREATE UNIQUE INDEX "financial_documents_reference_key" ON "financial_documents"("reference");

-- CreateIndex
CREATE INDEX "financial_documents_status_idx" ON "financial_documents"("status");

-- CreateIndex
CREATE INDEX "financial_documents_counterpartyId_idx" ON "financial_documents"("counterpartyId");

-- CreateIndex
CREATE INDEX "financial_documents_dueDate_idx" ON "financial_documents"("dueDate");

-- CreateIndex
CREATE INDEX "financial_documents_serviceDate_idx" ON "financial_documents"("serviceDate");

-- CreateIndex
CREATE INDEX "financial_documents_tripFileId_idx" ON "financial_documents"("tripFileId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reference_key" ON "payment_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_reversesPaymentId_key" ON "payment_transactions"("reversesPaymentId");

-- CreateIndex
CREATE INDEX "payment_transactions_financialDocumentId_idx" ON "payment_transactions"("financialDocumentId");

-- CreateIndex
CREATE INDEX "payment_transactions_counterpartyId_idx" ON "payment_transactions"("counterpartyId");

-- CreateIndex
CREATE INDEX "payment_transactions_paymentDate_idx" ON "payment_transactions"("paymentDate");

-- CreateIndex
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_reference_key" ON "settlements"("reference");

-- CreateIndex
CREATE INDEX "settlements_partnerId_idx" ON "settlements"("partnerId");

-- CreateIndex
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

-- CreateIndex
CREATE INDEX "import_runs_status_idx" ON "import_runs"("status");

-- CreateIndex
CREATE INDEX "import_runs_checksum_idx" ON "import_runs"("checksum");

-- CreateIndex
CREATE UNIQUE INDEX "import_sheets_importRunId_sheetName_key" ON "import_sheets"("importRunId", "sheetName");

-- CreateIndex
CREATE INDEX "import_rows_importRunId_idx" ON "import_rows"("importRunId");

-- CreateIndex
CREATE INDEX "import_rows_kind_idx" ON "import_rows"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_importSheetId_rowNumber_key" ON "import_rows"("importSheetId", "rowNumber");

-- CreateIndex
CREATE INDEX "import_issues_importRunId_idx" ON "import_issues"("importRunId");

-- CreateIndex
CREATE INDEX "import_issues_category_idx" ON "import_issues"("category");

-- CreateIndex
CREATE INDEX "import_issues_severity_idx" ON "import_issues"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "data_quality_issues_fingerprint_key" ON "data_quality_issues"("fingerprint");

-- CreateIndex
CREATE INDEX "data_quality_issues_status_idx" ON "data_quality_issues"("status");

-- CreateIndex
CREATE INDEX "data_quality_issues_category_idx" ON "data_quality_issues"("category");

-- CreateIndex
CREATE INDEX "data_quality_issues_severity_idx" ON "data_quality_issues"("severity");

-- CreateIndex
CREATE INDEX "data_quality_issues_entityType_entityId_idx" ON "data_quality_issues"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "data_quality_issues_assignedToId_idx" ON "data_quality_issues"("assignedToId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_tripFileId_idx" ON "attachments"("tripFileId");

-- CreateIndex
CREATE INDEX "attachments_category_idx" ON "attachments"("category");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "saved_views_resource_idx" ON "saved_views"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "saved_views_userId_resource_name_key" ON "saved_views"("userId", "resource", "name");

-- CreateIndex
CREATE UNIQUE INDEX "reference_sequences_prefix_year_key" ON "reference_sequences"("prefix", "year");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_aliases" ADD CONSTRAINT "partner_aliases_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_aliases" ADD CONSTRAINT "hotel_aliases_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_aliases" ADD CONSTRAINT "room_type_aliases_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_aliases" ADD CONSTRAINT "meal_plan_aliases_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_aliases" ADD CONSTRAINT "location_aliases_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_aliases" ADD CONSTRAINT "excursion_aliases_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "excursion_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nationality_aliases" ADD CONSTRAINT "nationality_aliases_nationalityId_fkey" FOREIGN KEY ("nationalityId") REFERENCES "nationalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_mappings" ADD CONSTRAINT "alias_mappings_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_nationalityId_fkey" FOREIGN KEY ("nationalityId") REFERENCES "nationalities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travelers" ADD CONSTRAINT "travelers_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_leadTravelerId_fkey" FOREIGN KEY ("leadTravelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travelers" ADD CONSTRAINT "trip_travelers_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_travelers" ADD CONSTRAINT "trip_travelers_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "travelers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_transitions" ADD CONSTRAINT "status_transitions_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_leadTravelerId_fkey" FOREIGN KEY ("leadTravelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_bookings" ADD CONSTRAINT "hotel_bookings_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stay_segments" ADD CONSTRAINT "hotel_stay_segments_hotelBookingId_fkey" FOREIGN KEY ("hotelBookingId") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stay_segments" ADD CONSTRAINT "hotel_stay_segments_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_stay_segments" ADD CONSTRAINT "hotel_stay_segments_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_hotelStaySegmentId_fkey" FOREIGN KEY ("hotelStaySegmentId") REFERENCES "hotel_stay_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "room_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_occupantTravelerId_fkey" FOREIGN KEY ("occupantTravelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_bookings" ADD CONSTRAINT "transfer_bookings_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_bookings" ADD CONSTRAINT "transfer_bookings_leadTravelerId_fkey" FOREIGN KEY ("leadTravelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_bookings" ADD CONSTRAINT "transfer_bookings_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_bookings" ADD CONSTRAINT "transfer_bookings_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_transferBookingId_fkey" FOREIGN KEY ("transferBookingId") REFERENCES "transfer_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_legs" ADD CONSTRAINT "transfer_legs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_leadTravelerId_fkey" FOREIGN KEY ("leadTravelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_bookings" ADD CONSTRAINT "excursion_bookings_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_items" ADD CONSTRAINT "excursion_items_excursionBookingId_fkey" FOREIGN KEY ("excursionBookingId") REFERENCES "excursion_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excursion_items" ADD CONSTRAINT "excursion_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "excursion_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_orders" ADD CONSTRAINT "visa_orders_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_orders" ADD CONSTRAINT "visa_orders_leadTravelerId_fkey" FOREIGN KEY ("leadTravelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_orders" ADD CONSTRAINT "visa_orders_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_orders" ADD CONSTRAINT "visa_orders_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_applicants" ADD CONSTRAINT "visa_applicants_visaOrderId_fkey" FOREIGN KEY ("visaOrderId") REFERENCES "visa_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_applicants" ADD CONSTRAINT "visa_applicants_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "travelers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_hotelBookingId_fkey" FOREIGN KEY ("hotelBookingId") REFERENCES "hotel_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_financialDocumentId_fkey" FOREIGN KEY ("financialDocumentId") REFERENCES "financial_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sheets" ADD CONSTRAINT "import_sheets_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_importSheetId_fkey" FOREIGN KEY ("importSheetId") REFERENCES "import_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "import_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_quality_issues" ADD CONSTRAINT "data_quality_issues_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tripFileId_fkey" FOREIGN KEY ("tripFileId") REFERENCES "trip_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_hotelBookingId_fkey" FOREIGN KEY ("hotelBookingId") REFERENCES "hotel_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transferBookingId_fkey" FOREIGN KEY ("transferBookingId") REFERENCES "transfer_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_excursionBookingId_fkey" FOREIGN KEY ("excursionBookingId") REFERENCES "excursion_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_visaOrderId_fkey" FOREIGN KEY ("visaOrderId") REFERENCES "visa_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_financialDocumentId_fkey" FOREIGN KEY ("financialDocumentId") REFERENCES "financial_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
