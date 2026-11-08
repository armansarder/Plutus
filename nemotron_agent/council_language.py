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
    def expected_reason():
        return f"After the purchase and scheduled obligations, your lowest projected balance is {money(minimum, currency)} on {day(f['minimum_balance_date'])}, against your {buffer} cash buffer."

    def risk_reason():
        setbacks = [(name, r) for name, r in results.items()
                    if name in ('delayed_income', 'unexpected_expense') and r['applicable']]
        if not setbacks:
            return 'Setback results are not available yet. Missing future expenses and income timing remain untested.'
        name, worst = min(setbacks, key=lambda item: Decimal(item[1]['forecast']['minimum_balance']))
        label = 'income arriving three days late' if name == 'delayed_income' else 'an extra ' + money('200.00', currency) + ' expense'
        wf = worst['forecast']
        reason = f"The lowest balance among the tested setbacks is {money(wf['minimum_balance'], currency)} on {day(wf['minimum_balance_date'])}, with {label}. Your cash buffer is {buffer}."
        delay = results.get('delayed_income')
        if delay is not None and not delay['applicable']:
            reason += ' Late income could not be tested because no eligible future income was supplied.'
        else:
            reason += ' Expenses missing from your schedule are not covered.'
        return reason

    def comparison_reason():
        baseline = results.get('baseline')
        if not baseline:
            return expected_reason() + ' A no-purchase comparison is unavailable.'
        end = f['end_date']
        return f"By {day(end)}, keeping the cash projects {money(baseline['forecast']['ending_balance'], currency)}; buying projects {money(f['ending_balance'], currency)}. Buying reaches a low of {money(minimum, currency)} on {day(f['minimum_balance_date'])}."

    if position == 'consider_purchase':
        if role == 'budget':
            return 'The purchase fits your expected cash flow.', expected_reason() + ' This does not establish category-budget or savings-goal affordability.'
        if role == 'risk':
            return 'The tested setbacks keep your cash buffer.', risk_reason()
        if role == 'simulator':
            return 'Buying leaves less cash than skipping it.', comparison_reason()
        if analysis:
            reason = f"The purchase keeps your {buffer} cash buffer under the supplied schedule and all {analysis.stress_tests_total} applicable setback tests. Review Budget's expected balance, Risk's setback results, and the Simulator's alternatives below; unknown future expenses could change the answer."
        else:
            reason = f"The purchase fits the supplied schedule and your {buffer} buffer. Wait for the specialists' setback checks before treating this as the final assessment."
        return 'The purchase fits the scenarios tested.', reason
    if position == 'reserve_at_risk':
        if role == 'budget':
            return 'Keep this cash for your obligations.', expected_reason() + ' No ordinary purchase date tested preserves the buffer throughout this forecast.'
        if role == 'risk':
            return 'Hold off to protect your cash buffer.', risk_reason()
        if role == 'simulator':
            return 'Skipping preserves more cash in this forecast.', comparison_reason() + ' No tested ordinary purchase date keeps the buffer intact.'
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
        if role == 'risk':
            return 'Wait before committing cash.', risk_reason() if analysis else expected_reason() + ' Setback results are not available yet.'
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
        if role == 'risk':
            return 'Wait before committing to the purchase.', risk_reason() + ' At least one tested setback breaches the buffer.'
        if role == 'simulator':
            return 'Compare waiting with keeping the cash.', comparison_reason() + ' The selected purchase fails a setback test; a later date is not proven stress-safe.'
        return 'Wait before committing to the purchase.', f"It fits the expected schedule, but if {cause}, it could {consequence}. A later date has not yet been tested against that setback."
    return 'Wait if keeping extra flexibility matters to you.', f"The purchase fits the tested cash flow and keeps your {buffer} buffer. Waiting leaves more cash available; the forecasts cannot cover expenses that were not supplied."
