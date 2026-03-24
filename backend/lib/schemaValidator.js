/**
 * Schema Validator - Validate JSON-LD structured data
 * No external API - validates against schema.org spec locally
 */

// Required properties per schema type (simplified schema.org rules)
const SCHEMA_REQUIREMENTS = {
  'Article': {
    required: ['@type', '@context', 'headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'image', 'description', 'articleBody'],
  },
  'NewsArticle': {
    required: ['@type', '@context', 'headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'image', 'description'],
  },
  'BlogPosting': {
    required: ['@type', '@context', 'headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'image', 'articleBody'],
  },
  'Product': {
    required: ['@type', '@context', 'name', 'description'],
    recommended: ['image', 'price', 'priceCurrency', 'availability', 'rating', 'review'],
  },
  'LocalBusiness': {
    required: ['@type', '@context', 'name', 'address'],
    recommended: ['telephone', 'openingHoursSpecification', 'geo', 'image'],
  },
  'Organization': {
    required: ['@type', '@context', 'name'],
    recommended: ['logo', 'sameAs', 'url', 'contactPoint'],
  },
  'Person': {
    required: ['@type', '@context', 'name'],
    recommended: ['image', 'url'],
  },
  'FAQPage': {
    required: ['@type', '@context', 'mainEntity'],
    recommended: [],
  },
  'BreadcrumbList': {
    required: ['@type', '@context', 'itemListElement'],
    recommended: [],
  },
  'WebSite': {
    required: ['@type', '@context', 'name', 'url'],
    recommended: ['logo'],
  },
};

function validateSchema(schema) {
  const errors = [];
  const warnings = [];

  if (!schema['@type']) {
    errors.push('Missing @type property');
    return { valid: false, errors, warnings };
  }

  if (!schema['@context']) {
    errors.push('Missing @context property');
  }

  const schemaType = schema['@type'];
  const requirements = SCHEMA_REQUIREMENTS[schemaType];

  if (requirements) {
    // Check required properties
    for (const required of requirements.required) {
      if (!schema[required]) {
        errors.push(`Missing required property: ${required}`);
      }
    }

    // Check recommended properties
    for (const recommended of requirements.recommended) {
      if (!schema[recommended]) {
        warnings.push(`Missing recommended property: ${recommended}`);
      }
    }
  }

  // Validate specific types
  if (schemaType === 'Product' && schema.offers) {
    if (!schema.offers.price) warnings.push('Product missing price in offers');
    if (!schema.offers.priceCurrency) warnings.push('Product missing priceCurrency in offers');
  }

  if (schemaType === 'LocalBusiness' && schema.address) {
    const addressFields = ['streetAddress', 'addressLocality', 'addressCountry'];
    for (const field of addressFields) {
      if (!schema.address[field]) {
        warnings.push(`LocalBusiness address missing ${field}`);
      }
    }
  }

  if (schemaType === 'FAQPage' && schema.mainEntity) {
    if (!Array.isArray(schema.mainEntity)) {
      warnings.push('FAQPage mainEntity should be an array');
    } else {
      for (const qa of schema.mainEntity) {
        if (!qa.question || !qa.acceptedAnswer) {
          errors.push('FAQPage items must have question and acceptedAnswer');
        }
      }
    }
  }

  if (schemaType === 'BreadcrumbList' && schema.itemListElement) {
    if (!Array.isArray(schema.itemListElement)) {
      errors.push('BreadcrumbList itemListElement must be an array');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    type: schemaType,
  };
}

function extractSchemas(html) {
  const schemas = [];
  const jsonldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/gi;
  let match;

  while ((match = jsonldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      schemas.push(parsed);
    } catch (e) {
      // Invalid JSON-LD
    }
  }

  return schemas;
}

// Check if schema is eligible for rich results
function checkRichResultsEligibility(schema) {
  const eligibleTypes = [
    'Article', 'NewsArticle', 'BlogPosting',
    'Product', 'Review',
    'LocalBusiness', 'Organization',
    'FAQPage', 'BreadcrumbList',
  ];

  const schemaType = schema['@type'];
  return eligibleTypes.includes(schemaType);
}

export function validatePageSchemas(html) {
  try {
    const schemas = extractSchemas(html);

    if (schemas.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          schemas: [],
          allValid: false,
          richResultsEligible: [],
          issues: [
            {
              type: 'warning',
              message: 'No JSON-LD schema found. Add structured data to improve search visibility.',
              recommendation: 'Add schema.org markup for your page type (Article, Product, etc.)',
            },
          ],
        },
      };
    }

    const validations = schemas.map(schema => validateSchema(schema));
    const allValid = validations.every(v => v.valid);
    const richResultsEligible = schemas
      .map((schema, idx) => ({
        index: idx,
        type: schema['@type'],
        eligible: checkRichResultsEligibility(schema),
        validation: validations[idx],
      }))
      .filter(s => s.eligible);

    const issues = [];
    validations.forEach((validation, idx) => {
      validation.errors.forEach(error => {
        issues.push({
          schemaIndex: idx,
          type: 'error',
          message: error,
        });
      });
      validation.warnings.forEach(warning => {
        issues.push({
          schemaIndex: idx,
          type: 'warning',
          message: warning,
        });
      });
    });

    return {
      success: true,
      data: {
        found: true,
        totalSchemas: schemas.length,
        validSchemas: validations.filter(v => v.valid).length,
        allValid,
        schemas: validations,
        richResultsEligible,
        issues,
        recommendation: !allValid
          ? 'Fix validation errors above to improve search results eligibility'
          : richResultsEligible.length > 0
          ? 'Schema is valid and eligible for rich results'
          : 'Schema is valid but not eligible for rich results. Consider adding supported types.',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  validatePageSchemas,
  validateSchema,
  extractSchemas,
  checkRichResultsEligibility,
};
