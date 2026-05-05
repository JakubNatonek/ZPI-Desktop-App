import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const NAME_PATTERN = /^[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ][a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s\-]{1,99}$/;


const EMAIL_PATTERN = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

/** Walidator imienia/nazwiska (polskie znaki, myślnik, spacja, trim). */
export function nameValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const raw: string = control.value ?? '';
        const value = raw.trim();

        if (!value) {
            return { required: true };
        }
        if (value.length < 2) {
            return { minlength: { requiredLength: 2, actualLength: value.length } };
        }
        if (value.length > 100) {
            return { maxlength: { requiredLength: 100, actualLength: value.length } };
        }
        if (!NAME_PATTERN.test(value)) {
            return { nameInvalid: true };
        }
        return null;
    };
}

/** Walidator e-mail z dokładniejszym wzorcem regex. */
export function strictEmailValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value: string = (control.value ?? '').trim();
        if (!value) {
            return { required: true };
        }
        if (!EMAIL_PATTERN.test(value)) {
            return { email: true };
        }
        return null;
    };
}

/** Walidator złożoności hasła. */
export function passwordStrengthValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value: string = control.value ?? '';

        if (!value) {
            return { required: true };
        }

        const errors: Record<string, boolean> = {};

        if (value.length < 8) {
            errors['minlength'] = true;
        }
        if (!/[A-Z]/.test(value)) {
            errors['missingUppercase'] = true;
        }
        if (!/[a-z]/.test(value)) {
            errors['missingLowercase'] = true;
        }
        if (!/[0-9]/.test(value)) {
            errors['missingDigit'] = true;
        }
        if (!/[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(value)) {
            errors['missingSpecial'] = true;
        }

        return Object.keys(errors).length > 0 ? errors : null;
    };
}

/**
 * Walidator na poziomie FormGroup – sprawdza, czy dwa pola są identyczne.
 * @param passwordKey  nazwa pola z nowym hasłem
 * @param confirmKey   nazwa pola z potwierdzeniem hasła
 */
export function passwordMatchValidator(passwordKey: string, confirmKey: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
        const password = group.get(passwordKey)?.value ?? '';
        const confirm = group.get(confirmKey)?.value ?? '';

        if (!confirm) {
            return null; // brak wartości – osobny walidator required obsłuży to pole
        }

        return password === confirm ? null : { passwordMismatch: true };
    };
}

/**
 * Walidator sprawdzający, czy hasło nie zawiera imienia ani nazwiska użytkownika.
 * Porównanie jest case-insensitive i ignoruje znaki diakrytyczne (normalizacja NFKD).
 * @param firstName  imię użytkownika (może być puste)
 * @param lastName   nazwisko użytkownika (może być puste)
 */
export function passwordNotContainsNameValidator(firstName: string, lastName: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
        const value: string = control.value ?? '';
        if (!value) return null;

        const normalize = (s: string) =>
            s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        const normalizedPassword = normalize(value);

        const parts: string[] = [];
        if (firstName && firstName.trim().length >= 3) {
            firstName.trim().split(/\s+/).forEach((p) => { if (p.length >= 3) parts.push(normalize(p)); });
        }
        if (lastName && lastName.trim().length >= 3) {
            lastName.trim().split(/[\s\-]+/).forEach((p) => { if (p.length >= 3) parts.push(normalize(p)); });
        }

        for (const part of parts) {
            if (normalizedPassword.includes(part)) {
                return { containsName: true };
            }
        }
        return null;
    };
}

export function calcPasswordStrength(password: string): number {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[!@#$%^&*()\-_=+[\]{};:'",.<>?/\\|`~]/.test(password)) score++;
    return Math.min(4, score);
}
