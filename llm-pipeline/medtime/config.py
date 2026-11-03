"""Settings of the annotator. Everything that can be tuned is here, nothing else needs to change.

The values are the ones used for the evaluation in the paper (Gemini 2.5 Flash, 5 gold patients).
"""

# --- Gemini --------------------------------------------------------------------------------------------
# We call Gemini through Google's OpenAI-compatible endpoint, so the plain `openai` package is enough.
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
API_KEY_ENV = "GEMINI_API_KEY"   # the key is read from this environment variable, never written in the code
REASONING_EFFORT = "none"        # Gemini 2.5 "thinking" switched off: faster, and it was not needed
TEMPERATURE = 0.0                # greedy decoding, the same text gives (almost) the same annotation

# --- requests ------------------------------------------------------------------------------------------
MAX_PARALLEL_REQUESTS = 8        # sentences / batches are sent to Gemini in parallel
MAX_ATTEMPTS = 3                 # an invalid JSON answer is asked again up to this many times
REQUEST_TIMEOUT = 600            # seconds
HTTP_RETRIES = 8                 # the openai client waits and retries on rate limits (HTTP 429) and server errors

# Upper limit of answer tokens per prompt. A longer answer is a runaway generation and is discarded.
MAX_TOKENS = {
    "events": 768, "events_missing": 512, "event_verification": 1024, "participant_check": 768,
    "timexes": 384, "timexes_missing": 256,
    "yes_no_step": 2048, "medical_class_fallback": 1536, "timex_type_step": 1024, "timex_type_fallback": 512,
    "observations": 512, "morphosyntax": 2048, "semantics": 1024, "timex_value": 1024,
    "tlink_pairs": 1024, "tlink_pairs_missing": 512, "relation_fallback": 1536, "cross_report": 1536,
}
DEFAULT_MAX_TOKENS = 2048

# --- pipeline ------------------------------------------------------------------------------------------
BATCH_SIZE = 25                  # candidates per classification prompt
TLINK_WINDOW = 1                 # how many previous sentences can hold the other end of a TLINK
EXTRA_DETECTION_PASSES = 1       # "what is still missing?" passes after the first detection answer
