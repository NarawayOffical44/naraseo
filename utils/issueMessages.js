/**
 * Plain English messages for every SEO issue type
 * Non-technical language for business owners
 * This file is where all user-facing text lives
 */

export const ISSUE_MESSAGES = {
  // ON-PAGE
  'missing-title': {
    shortTitle: 'Page has no title',
    detail: 'Your page is missing a title tag. Google uses this to understand what your page is about. Without one, your page won\'t rank well in Google searches.',
    whatToDo: 'Add a title tag to your page\'s <head> section.',
    codeExample: '<title>Best Dentist in Austin - Smith Dental</title>',
    whyItMatters: 'Titles appear in Google search results. Good titles lead to more clicks.',
  },

  'title-too-short': {
    shortTitle: 'Title tag is too short',
    detail: 'Your title is less than 30 characters. Titles should be 50-60 characters to show completely in Google search results.',
    whatToDo: 'Make your title longer by adding your city, main keyword, and brand.',
    codeExample: '<title>Dental Clinic in Austin TX - Emergency & Family Dentistry | Smith Dental</title>',
    whyItMatters: 'Longer titles have more keywords, which helps you rank for more searches.',
  },

  'title-too-long': {
    shortTitle: 'Title tag is too long',
    detail: 'Your title is longer than 60 characters. Google cuts off titles longer than this in search results.',
    whatToDo: 'Shorten your title to 50-60 characters. Keep the most important keywords.',
    codeExample: '<title>Best Dentist in Austin - Family & Emergency | Smith</title>',
    whyItMatters: 'Users only see your full title if it\'s short enough. Longer titles get cut off.',
  },

  'missing-meta-description': {
    shortTitle: 'Missing page description',
    detail: 'Your page has no meta description. This is the text Google shows under your title in search results. Without it, Google picks random text from your page.',
    whatToDo: 'Write a 150-160 character description that summarizes what this page is about.',
    codeExample: '<meta name="description" content="Award-winning dental clinic in Austin offering family dentistry, emergency care, and cosmetic treatments. Schedule your appointment today.">',
    whyItMatters: 'Good descriptions get more clicks from Google search results.',
  },

  'meta-too-short': {
    shortTitle: 'Description is too short',
    detail: 'Your description is less than 120 characters. Google descriptions should be 150-160 characters to show completely.',
    whatToDo: 'Expand your description to 150-160 characters to show your full message.',
    codeExample: '<meta name="description" content="Award-winning dental clinic in Austin. Family dentistry, emergency care, cosmetic treatments. We accept most insurance. Call now.">',
    whyItMatters: 'Longer descriptions show more information, which gets more clicks.',
  },

  'meta-too-long': {
    shortTitle: 'Description is too long',
    detail: 'Your description is longer than 160 characters. Google cuts off longer descriptions in search results.',
    whatToDo: 'Shorten your description to 150-160 characters.',
    codeExample: '<meta name="description" content="Award-winning dental clinic in Austin. Family dentistry, emergency care, and cosmetic treatments available.">',
    whyItMatters: 'Users only see your full description if it fits. Longer ones get cut off.',
  },

  'missing-h1': {
    shortTitle: 'Page has no H1 heading',
    detail: 'Your page is missing an H1 tag. This is your page\'s main heading. Google uses it to understand what your page is about.',
    whatToDo: 'Add one H1 tag at the beginning of your page content with your main keyword.',
    codeExample: '<h1>Austin Dentist - Comprehensive Family Dental Care</h1>',
    whyItMatters: 'H1 tags tell Google what your page is about. Every page needs exactly one.',
  },

  'multiple-h1': {
    shortTitle: 'Page has too many H1 tags',
    detail: 'Your page has multiple H1 tags. Google expects exactly one H1 per page to understand your main topic.',
    whatToDo: 'Remove all H1 tags except the one that best describes your page topic.',
    codeExample: '<h1>Your Main Topic Here</h1> <!-- Keep only this one -->',
    whyItMatters: 'Multiple H1s confuse Google about what your page is about.',
  },

  // ACCESSIBILITY
  'img-no-alt': {
    shortTitle: 'Image has no description',
    detail: 'Google cannot see images. It reads the "alt text" (description) to understand what your image shows. This also helps blind users using screen readers.',
    whatToDo: 'Add a description in the alt attribute that explains what the image shows.',
    codeExample: '<img src="dentist-office.jpg" alt="Austin dental clinic reception area with modern furniture">',
    whyItMatters: 'Alt text helps Google index your images, which can bring image search traffic.',
  },

  // MOBILE
  'missing-viewport': {
    shortTitle: 'Site not mobile-friendly',
    detail: 'Your page is missing the viewport meta tag. This tells mobile phones how to display your site. Without it, your site won\'t look right on phones.',
    whatToDo: 'Add this line to your page\'s <head> section.',
    codeExample: '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    whyItMatters: 'More than 60% of searches are on mobile. Google prioritizes mobile-friendly sites.',
  },

  // TECHNICAL
  'missing-canonical': {
    shortTitle: 'Missing canonical tag',
    detail: 'Canonical tags tell Google which version of a page is the "main" version if you have duplicate content (common with URL variations).',
    whatToDo: 'Add a self-referencing canonical tag to important pages.',
    codeExample: '<link rel="canonical" href="https://yoursite.com/page">',
    whyItMatters: 'Prevents Google from splitting your ranking power between duplicate pages.',
  },

  // SOCIAL
  'missing-og-tags': {
    shortTitle: 'Missing social media tags',
    detail: 'Open Graph tags control how your page appears when shared on Facebook, LinkedIn, Twitter, etc. Without them, your share looks plain.',
    whatToDo: 'Add Open Graph meta tags for better social sharing.',
    codeExample: '<meta property="og:title" content="Your Page Title">\n<meta property="og:description" content="Your description">\n<meta property="og:image" content="https://yoursite.com/image.jpg">',
    whyItMatters: 'Good social previews get more clicks when your page is shared.',
  },

  'missing-twitter-card': {
    shortTitle: 'Missing Twitter Card',
    detail: 'Twitter Card tags make your content look better when shared on Twitter.',
    whatToDo: 'Add Twitter Card meta tag.',
    codeExample: '<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="Your Title">\n<meta name="twitter:image" content="https://yoursite.com/image.jpg">',
    whyItMatters: 'Better-looking Twitter shares get more engagement.',
  },

  'missing-charset': {
    shortTitle: 'Missing character encoding',
    detail: 'Charset tells browsers how to read your page text. UTF-8 is the standard.',
    whatToDo: 'Add this to your page\'s <head>.',
    codeExample: '<meta charset="utf-8">',
    whyItMatters: 'Ensures your text displays correctly in all browsers.',
  },

  // PERFORMANCE
  'img-no-dimensions': {
    shortTitle: 'Image missing dimensions',
    detail: 'Images without width/height attributes cause layout shift when loading. This hurts user experience and your Core Web Vitals score.',
    whatToDo: 'Add width and height attributes to your images.',
    codeExample: '<img src="photo.jpg" alt="Description" width="800" height="600">',
    whyItMatters: 'Layout stability is a Google ranking factor. Helps your site rank higher.',
  },

  'no-h2-tags': {
    shortTitle: 'No H2 tags found',
    detail: 'H2 tags break your content into sections, making it easier for Google to understand and for users to scan.',
    whatToDo: 'Add H2 tags to organize your content into clear sections.',
    codeExample: '<h2>Why Choose Our Dental Clinic</h2>\n<p>...</p>\n<h2>Our Services</h2>',
    whyItMatters: 'Good content structure helps Google understand your page better.',
  },

  'external-links-no-noopener': {
    shortTitle: 'External links lack security attribute',
    detail: 'External links without rel="noopener" are a security risk. They also prevent proper performance measurement.',
    whatToDo: 'Add rel="noopener" to all external links.',
    codeExample: '<a href="https://external-site.com" rel="noopener">Link Text</a>',
    whyItMatters: 'Better security and performance.',
  },
};

/**
 * Get message for an issue
 * @param {string} issueId - Issue ID or type
 * @returns {Object} Full message object
 */
export function getIssueMessage(issueId) {
  return ISSUE_MESSAGES[issueId] || {
    shortTitle: 'SEO Issue',
    detail: 'This is an SEO issue that needs attention.',
    whatToDo: 'Review your page and fix this issue.',
    codeExample: '',
    whyItMatters: 'Fixing SEO issues helps your site rank better in Google.',
  };
}
