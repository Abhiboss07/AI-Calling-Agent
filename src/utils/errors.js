// L1: Standardized API error class for consistent error responses

class ApiError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.details = details;
    }

    toJSON() {
        return {
            ok: false,
            error: this.message,
            ...(this.details && { details: this.details })
        };
    }
}

module.exports = { ApiError };
