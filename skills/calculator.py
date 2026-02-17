import ast
import logging
import math
import operator

from skills.base_skill import BaseSkill

logger = logging.getLogger(__name__)

# Allowed math functions exposed to expressions
SAFE_FUNCTIONS = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sum": sum,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "atan2": math.atan2,
    "sqrt": math.sqrt,
    "log": math.log,
    "log2": math.log2,
    "log10": math.log10,
    "exp": math.exp,
    "pow": math.pow,
    "ceil": math.ceil,
    "floor": math.floor,
    "factorial": math.factorial,
    "gcd": math.gcd,
    "radians": math.radians,
    "degrees": math.degrees,
}

SAFE_CONSTANTS = {
    "pi": math.pi,
    "e": math.e,
    "tau": math.tau,
    "inf": math.inf,
}

SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

UNIT_CONVERSIONS = {
    # Length
    ("km", "m"): 1000,
    ("m", "cm"): 100,
    ("cm", "mm"): 10,
    ("m", "mm"): 1000,
    ("mile", "km"): 1.60934,
    ("yard", "m"): 0.9144,
    ("foot", "m"): 0.3048,
    ("inch", "cm"): 2.54,
    # Weight
    ("kg", "g"): 1000,
    ("g", "mg"): 1000,
    ("lb", "kg"): 0.453592,
    ("oz", "g"): 28.3495,
    ("ton", "kg"): 1000,
    # Volume
    ("l", "ml"): 1000,
    ("gallon", "l"): 3.78541,
    # Temperature handled separately
    # Time
    ("h", "min"): 60,
    ("min", "s"): 60,
    ("h", "s"): 3600,
    ("day", "h"): 24,
    # Data
    ("gb", "mb"): 1024,
    ("mb", "kb"): 1024,
    ("tb", "gb"): 1024,
}


def _safe_eval(node):
    """Recursively evaluate an AST node with only safe operations."""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float, complex)):
            return node.value
        raise ValueError(f"Nicht erlaubter Wert: {node.value}")
    elif isinstance(node, ast.Name):
        if node.id in SAFE_CONSTANTS:
            return SAFE_CONSTANTS[node.id]
        raise ValueError(f"Unbekannte Variable: {node.id}")
    elif isinstance(node, ast.BinOp):
        op_func = SAFE_OPS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Nicht erlaubter Operator: {type(node.op).__name__}")
        left = _safe_eval(node.left)
        right = _safe_eval(node.right)
        return op_func(left, right)
    elif isinstance(node, ast.UnaryOp):
        op_func = SAFE_OPS.get(type(node.op))
        if op_func is None:
            raise ValueError(f"Nicht erlaubter Operator: {type(node.op).__name__}")
        return op_func(_safe_eval(node.operand))
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise ValueError("Nur direkte Funktionsaufrufe erlaubt.")
        func_name = node.func.id
        if func_name not in SAFE_FUNCTIONS:
            raise ValueError(f"Unbekannte Funktion: {func_name}")
        args = [_safe_eval(a) for a in node.args]
        return SAFE_FUNCTIONS[func_name](*args)
    else:
        raise ValueError(f"Nicht unterstuetzter Ausdruck: {type(node).__name__}")


class CalculatorSkill(BaseSkill):
    @property
    def name(self) -> str:
        return "calculator"

    @property
    def description(self) -> str:
        return (
            "Wertet mathematische Ausdruecke sicher aus und fuehrt Einheitenumrechnungen durch. "
            "Unterstuetzt Grundrechenarten, Potenzen, trigonometrische Funktionen, "
            "Logarithmen, Wurzeln und Konstanten (pi, e)."
        )

    @property
    def parameters(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["evaluate", "convert"],
                    "description": "'evaluate' wertet einen Ausdruck aus, 'convert' rechnet Einheiten um.",
                },
                "expression": {
                    "type": "string",
                    "description": "Mathematischer Ausdruck, z.B. 'sqrt(144) + 3**2'. Nur bei action='evaluate'.",
                },
                "value": {
                    "type": "number",
                    "description": "Der umzurechnende Wert. Nur bei action='convert'.",
                },
                "from_unit": {
                    "type": "string",
                    "description": "Ausgangseinheit, z.B. 'km', 'lb', 'celsius'. Nur bei action='convert'.",
                },
                "to_unit": {
                    "type": "string",
                    "description": "Zieleinheit, z.B. 'm', 'kg', 'fahrenheit'. Nur bei action='convert'.",
                },
            },
            "required": ["action"],
        }

    async def execute(self, action: str = "evaluate", **kwargs) -> str:
        try:
            if action == "convert":
                return self._convert(
                    kwargs.get("value", 0),
                    kwargs.get("from_unit", ""),
                    kwargs.get("to_unit", ""),
                )
            # evaluate
            expression = kwargs.get("expression", "")
            if not expression:
                return "Fehler: Kein Ausdruck angegeben."
            return self._evaluate(expression)
        except Exception as e:
            logger.exception("Calculator failed")
            return f"Fehler bei der Berechnung: {e}"

    @staticmethod
    def _evaluate(expression: str) -> str:
        # Replace common notations
        expr = expression.replace("^", "**").replace("×", "*").replace("÷", "/")
        try:
            tree = ast.parse(expr, mode="eval")
        except SyntaxError as e:
            return f"Syntaxfehler im Ausdruck: {e}"

        result = _safe_eval(tree)

        # Format nicely
        if isinstance(result, float) and result == int(result) and not math.isinf(result):
            result = int(result)

        return f"`{expression}` = **{result}**"

    @staticmethod
    def _convert(value: float, from_unit: str, to_unit: str) -> str:
        if not from_unit or not to_unit:
            return "Fehler: 'from_unit' und 'to_unit' sind erforderlich."

        f = from_unit.lower().strip()
        t = to_unit.lower().strip()

        # Temperature special cases
        if f == "celsius" and t == "fahrenheit":
            result = value * 9 / 5 + 32
            return f"**{value}** °C = **{result:.2f}** °F"
        if f == "fahrenheit" and t == "celsius":
            result = (value - 32) * 5 / 9
            return f"**{value}** °F = **{result:.2f}** °C"
        if f == "celsius" and t == "kelvin":
            result = value + 273.15
            return f"**{value}** °C = **{result:.2f}** K"
        if f == "kelvin" and t == "celsius":
            result = value - 273.15
            return f"**{value}** K = **{result:.2f}** °C"

        # Look up direct conversion
        key = (f, t)
        reverse_key = (t, f)

        if key in UNIT_CONVERSIONS:
            factor = UNIT_CONVERSIONS[key]
            result = value * factor
            return f"**{value}** {from_unit} = **{result:g}** {to_unit}"
        elif reverse_key in UNIT_CONVERSIONS:
            factor = UNIT_CONVERSIONS[reverse_key]
            result = value / factor
            return f"**{value}** {from_unit} = **{result:g}** {to_unit}"
        else:
            available = set()
            for (a, b) in UNIT_CONVERSIONS:
                available.add(a)
                available.add(b)
            return f"Umrechnung von '{from_unit}' nach '{to_unit}' nicht unterstuetzt. Verfuegbare Einheiten: {', '.join(sorted(available))}"
