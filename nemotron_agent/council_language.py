"""Plain-language decisions derived only from validated engine evidence."""
from datetime import date
from decimal import Decimal


def money(value, currency):
    amount = Decimal(value)
    symbol = '$' if currency == 'USD' else currency + ' '
    return ('−' if amount < 0 else '') + symbol + format(abs(amount), ',.2f').removesuffix('.00')


def day(value):
    d = date.fromisoformat(str(value))
    return d.strftime('%B') + ' ' + str(d.day)


def choices(role, results, analysis, stage):
    if not results:
        return ['insufficient_evidence']
    purchase_ok = results['purchase']['maintains_reserve']
    if stage == 'synthesis' and analysis:
        return [analysis.passport.recommendation]
    # Budget judges ordinary cash flow; Risk/Leader/Simulator also consider stress evidence.
    stress_fail = role != 'budget' and any(not r['maintains_reserve'] for name, r in results.items()
                                          if name in ('delayed_income', 'unexpected_expense') and r['applicable'])
    if not purchase_ok:
        return ['reserve_at_risk'] if analysis and not analysis.safe_purchase_dates else ['consider_waiting']
    if stress_fail:
        return ['consider_waiting']
    # An initial reviewer may defer until the adverse-scenario results arrive.
    return ['consider_purchase'] if analysis else ['consider_purchase', 'consider_waiting']


def decision_copy(role, position, results, analysis, request, currency):
    purchase = results['purchase']
    f = purchase['forecast']
    buffer = money(request.reserve, currency)
    minimum = Decimal(f['minimum_balance'])
    if position == 'consider_purchase':
        title = 'You can buy it on the selected date.'
        if role == 'budget':
            reason = f"After the purchase and scheduled bills, your lowest balance would be {money(minimum, currency)}, keeping your {buffer} cash buffer intact."
        else:
            reason = f"The purchase keeps your {buffer} cash buffer intact under the expected schedule"
            reason += ' and every applicable setback tested.' if analysis else '.'
        return title, reason
    if position == 'reserve_at_risk':
        return 'Hold off on this purchase.', f"None of the purchase dates tested keeps your {buffer} cash buffer intact. Keep the money for upcoming expenses and recheck when your finances change."
    safe = analysis.safe_purchase_dates if analysis else []
    if not purchase['maintains_reserve']:
        if minimum < 0:
            reason = f"Buying on the selected date could leave you {money(-minimum, currency)} short on {day(f['minimum_balance_date'])}."
        else:
            reason = f"Buying on the selected date could leave only {money(minimum, currency)} on {day(f['minimum_balance_date'])}, below your {buffer} cash buffer."
        if role == 'budget':
            return "Don't buy it on the selected date.", reason + ' Keep that cash for your scheduled expenses.'
        delay = results.get('delayed_income')
        if role == 'risk' and delay and delay['applicable'] and not delay['maintains_reserve']:
            low = Decimal(delay['forecast']['minimum_balance'])
            impact = f"leave you {money(-low, currency)} short" if low < 0 else f"leave only {money(low, currency)}, below your {buffer} buffer"
            return 'Wait for your income to arrive.', f"With your income three days late, the purchase could still {impact}. Recheck after the money reaches your account."
        if role == 'simulator' and safe:
            return f"Try buying on {day(safe[0])} instead.", f"That is the first tested date that keeps your {buffer} cash buffer. It assumes income arrives as scheduled, so rerun the forecast if the deposit is late."
        if role == 'council' and delay and delay['applicable']:
            return 'Wait for your income, then recheck.', reason + f" Keep the {money(request.purchase_amount, currency)} for upcoming bills until the income clears."
        if safe:
            reason += f" {day(safe[0])} is the first tested date that keeps your {buffer} buffer, assuming income arrives as scheduled."
            title = f"Wait until {day(safe[0])}, then recheck."
        else:
            title = 'Wait before buying it.'
            reason += ' Keep the money for your upcoming expenses.'
        return title, reason
    failed = [(name, r) for name, r in results.items() if name in ('delayed_income', 'unexpected_expense')
              and r['applicable'] and not r['maintains_reserve']]
    if failed and role != 'budget':
        name, stress = failed[0]
        cause = 'your next income arrives three days late' if name == 'delayed_income' else 'an unexpected ' + money('200.00', currency) + ' expense comes up'
        low = Decimal(stress['forecast']['minimum_balance'])
        consequence = f"leave you {money(-low, currency)} short" if low < 0 else f"leave only {money(low, currency)}, below your {buffer} cash buffer"
        return 'Wait before committing to the purchase.', f"It fits the expected schedule, but if {cause}, it could {consequence}. A later date has not yet been tested against that setback."
    if role == 'budget' and analysis and 'savings target' in analysis.summary:
        return "Don't buy it on the selected date.", f"Buying on the selected date leaves {money(minimum, currency)}, which keeps your {buffer} cash buffer intact but erodes your planned savings target."
    return 'Wait if keeping extra flexibility matters to you.', f"The purchase fits the tested cash flow and keeps your {buffer} buffer. Waiting leaves more cash available; the forecasts cannot cover expenses that were not supplied."
