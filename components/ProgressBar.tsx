"use client";

import React from "react";
import { Check, FileText, Brain } from "lucide-react";
import { useTranslations } from "next-intl";

interface ProgressBarProps {
  currentStep: "exam" | "answer";
}

const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep }) => {
  const t = useTranslations("common.progressBar");
  const steps = [
    {
      id: "exam" as const,
      label: t("chat.label"),
      icon: Brain,
      description: t("chat.description"),
    },
    {
      id: "answer" as const,
      label: t("answer.label"),
      icon: FileText,
      description: t("answer.description"),
    },
  ];

  const getStepIndex = (stepId: string) =>
    steps.findIndex((step) => step.id === stepId);
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="w-full py-2 px-4 relative">
      <div className="flex items-center justify-between max-w-3xl mx-auto relative">
        {/* Progress Line Background */}
        <div className="absolute top-4 left-6 right-6 h-0.5 bg-gray-300">
          <div
            className="h-full bg-green-500 transition-all duration-500 ease-out"
            style={{
              width:
                currentIndex === 0
                  ? "0%"
                  : `${(currentIndex / (steps.length - 1)) * 100}%`,
            }}
          />
        </div>

        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <div
              key={step.id}
              className="flex flex-col items-center relative z-10"
            >
              {/* Step Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isCompleted
                    ? "bg-green-500 border-green-500 text-white"
                    : isCurrent
                    ? "bg-blue-500 border-blue-500 text-white ring-2 ring-blue-200"
                    : "bg-gray-100 border-gray-300 text-gray-400"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>

              {/* Step Label */}
              <div className="mt-1 text-center max-w-20">
                <p
                  className={`text-xs font-medium ${
                    isCompleted
                      ? "text-green-600"
                      : isCurrent
                      ? "text-blue-600"
                      : "text-gray-400"
                  }`}
                >
                  {step.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProgressBar;
