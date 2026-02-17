#!/usr/bin/env python3
"""
Export shahrukhx01/question-vs-statement-classifier to ONNX format.
Run: pip install optimum[onnxruntime] transformers
     python scripts/export-question-classifier.py
Output: resources/models/question_classifier.onnx + tokenizer files
"""
import os
import sys

def main():
    try:
        from optimum.onnxruntime import ORTModelForSequenceClassification
        from transformers import AutoTokenizer
    except ImportError:
        print("Install: pip install 'optimum[onnxruntime]' transformers")
        sys.exit(1)

    model_name = "shahrukhx01/question-vs-statement-classifier"
    out_dir = os.path.join(os.path.dirname(__file__), "..", "resources", "models")
    os.makedirs(out_dir, exist_ok=True)

    print(f"Loading and exporting {model_name}...")
    ort_model = ORTModelForSequenceClassification.from_pretrained(
        model_name,
        export=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    ort_model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)
    print(f"Saved to {out_dir}")

if __name__ == "__main__":
    main()
